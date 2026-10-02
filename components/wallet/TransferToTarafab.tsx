'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconAlert, IconArrowDown, IconCheck } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'
import { fmt } from '@/components/dashboard/shared'
import { usePt } from '@/components/premium/Premium'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { StateView } from '@/components/ui/State'
import {
  WalletError, estimateNetworkFee, formatUnits, nativeBalance, networkOf, parseUnits, sendTransfer, shortAddress, tokenBalance, type Eip1193,
} from '@/lib/wallet/eip1193'

type Destination = { id: string; chain_id: number; network: string; asset: string; token_contract: string | null; decimals: number; address: string; min_confirmations: number }
type Transfer = {
  id: string; reference: string; chain_id: number; network: string; asset: string; decimals: number; quoted_amount: string; usd_rate: string
  quoted_usd: string; quoted_fee_usd: string; quoted_credit_usd: string; quote_expires_at: string; tx_hash: string | null
  required_confirmations: number; confirmations: number; received_amount: string | null; credited_usd: string | null; fee_usd: string | null
  status: 'awaiting_signature' | 'submitted' | 'confirming' | 'credited' | 'needs_review' | 'failed' | 'cancelled' | 'expired'; error: string | null; created_at: string
}
const EXPLORER: Record<number, string> = { 1: 'https://etherscan.io/tx/', 8453: 'https://basescan.org/tx/', 42161: 'https://arbiscan.io/tx/', 10: 'https://optimistic.etherscan.io/tx/', 137: 'https://polygonscan.com/tx/', 56: 'https://bscscan.com/tx/' }
const PENDING_KEY = 'tarafab.transferSubmit' // a hash the wallet returned that the server has not recorded yet
const usd = (v: string | number | null | undefined) => `$${fmt(Number(v ?? 0))}`

export function TransferToTarafab({ provider, address, chainId, walletId }: { provider: Eip1193; address: string; chainId: number; walletId: string | null }) {
  const pt = usePt()
  const { intl } = useI18n()
  const [dest, setDest] = useState<Destination[] | null>(null)
  const [list, setList] = useState<Transfer[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [destId, setDestId] = useState('')
  const [amount, setAmount] = useState('')
  const [walletBal, setWalletBal] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; v?: bigint }>({ state: 'idle' })
  const [tokenBals, setTokenBals] = useState<Record<string, string | null>>({})
  const [quote, setQuote] = useState<Transfer | null>(null)
  const [netFee, setNetFee] = useState<bigint | null | undefined>(undefined)
  const [busy, setBusy] = useState<'' | 'quote' | 'wallet' | 'submit'>('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const attempt = useRef(newRequestKey())
  const feature = useFeatures()

  const load = useCallback(async () => {
    try {
      const r = await readJson<{ transfers: Transfer[]; destinations: Destination[] }>(await authFetch('/api/client/transfers'))
      setDest(r.destinations); setList(r.transfers); setLoadErr('')
    } catch (e) { setLoadErr(errorText(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const here = useMemo(() => (dest || []).filter(d => d.chain_id === chainId), [dest, chainId])
  const selected = here.find(d => d.id === destId) || here[0] || null
  useEffect(() => { if (selected && selected.id !== destId) setDestId(selected.id) }, [selected, destId])
  const symbol = networkOf(chainId)?.symbol || 'ETH'

  // Real on-chain balances for the assets that can be transferred here.
  useEffect(() => {
    if (!here.length) return
    let alive = true
    ;(async () => {
      const out: Record<string, string | null> = {}
      for (const d of here) {
        try { out[d.id] = d.token_contract ? formatUnits(await tokenBalance(provider, d.token_contract, address), d.decimals) : await nativeBalance(provider, address, d.decimals) }
        catch { out[d.id] = null }
      }
      if (alive) setTokenBals(out)
    })()
    return () => { alive = false }
  }, [here, provider, address])
  useEffect(() => {
    if (!selected) return
    let alive = true
    setWalletBal({ state: 'loading' })
    ;(async () => {
      try {
        const v = selected.token_contract ? await tokenBalance(provider, selected.token_contract, address)
          : BigInt(String(await provider.request({ method: 'eth_getBalance', params: [address, 'latest'] })))
        if (alive) setWalletBal({ state: 'ok', v })
      } catch { if (alive) setWalletBal({ state: 'error' }) }
    })()
    return () => { alive = false }
  }, [selected, provider, address])

  // Re-record a hash the wallet returned if the page was closed before the
  // server stored it (never sends anything again).
  const submitHash = useCallback(async (id: string, hash: string) => {
    for (let i = 0; i < 4; i++) {
      try {
        await readJson(await authFetch('/api/client/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', id, tx_hash: hash }) }))
        try { localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ }
        return true
      } catch (e) {
        const msg = errorText(e)
        if (/already been submitted|already submitted|not found/i.test(msg)) { try { localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ } return false }
        await new Promise(r => setTimeout(r, 1500 * (i + 1)))
      }
    }
    return false
  }, [])
  useEffect(() => {
    let p: { id: string; hash: string } | null = null
    try { p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') } catch { /* ignore */ }
    if (p?.id && /^0x[0-9a-f]{64}$/.test(p.hash)) void submitHash(p.id, p.hash).then(load)
  }, [submitHash, load])

  // Follow transfers that are on their way.
  const active = list.some(x => x.status === 'submitted' || x.status === 'confirming')
  useEffect(() => {
    if (!active) return
    const id = setInterval(async () => {
      const t = list.find(x => x.status === 'submitted' || x.status === 'confirming')
      if (!t || document.visibilityState !== 'visible') return
      try { await authFetch('/api/client/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', id: t.id }) }) } catch { /* next tick */ }
      void load()
    }, 20_000)
    return () => clearInterval(id)
  }, [active, list, load])

  const units = selected ? parseUnits(amount || '', selected.decimals) : null
  const review = async () => {
    setError(''); setNotice('')
    if (!selected || !walletId) return
    if (!units || units <= BigInt(0)) { setError(pt('tr.invalidAmount')); return }
    if (walletBal.state === 'ok' && walletBal.v != null && units > walletBal.v) { setError(pt('tr.insufficient')); return }
    setBusy('quote')
    try {
      const r = await readJson<{ transfer: Transfer }>(await authFetch('/api/client/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quote', wallet_id: walletId, destination_id: selected.id, amount: amount.trim(), idempotency_key: attempt.current }),
      }))
      setQuote(r.transfer); setNetFee(undefined)
      void estimateNetworkFee(provider, { from: address, to: selected.address, token: selected.token_contract, amount: units }).then(setNetFee)
    } catch (e) { setError(errorText(e)) }
    setBusy('')
  }
  const cancelQuote = async () => {
    const q = quote; setQuote(null); attempt.current = newRequestKey()
    if (q) { try { await authFetch('/api/client/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: q.id }) }) } catch { /* expires anyway */ } }
    void load()
  }
  const confirm = async () => {
    if (!quote || !selected || !units) return
    setBusy('wallet'); setError('')
    let hash = ''
    try {
      hash = await sendTransfer(provider, { from: address, to: selected.address, token: selected.token_contract, amount: units })
    } catch (e) {
      // Declined or failed in the wallet: nothing was sent, so the quote is
      // closed and the reason shown.
      setBusy(''); await cancelQuote(); setError(e instanceof WalletError ? e.message : errorText(e)); return
    }
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ id: quote.id, hash })) } catch { /* ignore */ }
    setBusy('submit')
    const ok = await submitHash(quote.id, hash)
    setBusy(''); setQuote(null); setAmount(''); attempt.current = newRequestKey()
    if (ok) setNotice(pt('tr.sent')); else setError(pt('tr.recordFailed', { hash: shortAddress(hash) }))
    void load()
  }

  const fs = feature('wallet_transfer')
  if (hiddenState(fs) || fs === 'coming_soon') return <StateView compact state="unavailable" title={pt('tr.title')} body={fs === 'coming_soon' ? pt('ft.comingSoon') : pt('ft.unavailable')} />
  if (loadErr) return <div className="panel p-5 text-sm text-red-300" role="alert">{pt('tr.loadError')} {loadErr}</div>
  if (!dest) return <div className="panel p-5 text-sm text-fg-muted flex items-center gap-2"><Spinner /> {pt('tr.title')}…</div>

  const otherNets = Array.from(new Set(dest.map(d => networkOf(d.chain_id)?.name || d.network)))
  const statusText = (x: Transfer) => pt(`tr.status.${x.status}`, { n: x.confirmations, total: x.required_confirmations })
  const tone: Record<Transfer['status'], string> = {
    awaiting_signature: 'text-fg-muted border-ink-600', submitted: 'text-sky-300 border-sky-500/30', confirming: 'text-sky-300 border-sky-500/30',
    credited: 'text-emerald-400 border-emerald-500/30', needs_review: 'text-amber-300 border-amber-500/30', failed: 'text-red-300 border-red-500/30',
    cancelled: 'text-fg-faint border-ink-600', expired: 'text-fg-faint border-ink-600',
  }

  return (
    <section className="panel p-5 sm:p-6 space-y-4" aria-labelledby="tr-title">
      <div>
        <h3 id="tr-title" className="text-[15px] font-semibold text-fg flex items-center gap-2"><IconArrowDown width={16} height={16} />{pt('tr.title')}</h3>
        <p className="text-sm text-fg-muted mt-0.5">{pt('tr.subtitle')}</p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-ink-700 px-3 py-1 text-[12px] text-fg-muted flow-chip">{pt('tr.direction')}</p>
      </div>

      {!walletId ? <p className="text-sm text-fg-muted">{pt('tr.verifyFirst')}</p>
        : !dest.length ? <p className="text-sm text-fg-muted">{pt('tr.unavailable')}</p>
        : !here.length ? <p className="text-sm text-fg-muted">{pt('tr.noneOnNetwork', { network: networkOf(chainId)?.name || `chain ${chainId}`, list: otherNets.join(', ') })}</p>
        : (
          <>
            <div>
              <p className="text-[12px] uppercase tracking-[0.12em] text-fg-faint">{pt('tr.tokens')}</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {here.map(d => (
                  <li key={d.id} className="rounded-lg border border-ink-700 px-3 py-1.5 text-[13px] tabular-nums">
                    <span className="text-fg-muted">{d.asset}</span>{' '}
                    <span className="text-fg">{tokenBals[d.id] === undefined ? '…' : tokenBals[d.id] === null ? pt('tr.walletBalanceUnavailable') : tokenBals[d.id]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid sm:grid-cols-[10rem_1fr] gap-3">
              <label className="block">
                <span className="field-label">{pt('tr.asset')}</span>
                <select value={selected?.id || ''} onChange={e => { setDestId(e.target.value); setError('') }} className="field" disabled={!!busy}>
                  {here.map(d => <option key={d.id} value={d.id}>{d.asset}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">{pt('tr.amount', { asset: selected?.asset || '' })}</span>
                <input value={amount} onChange={e => { setAmount(e.target.value.replace(',', '.')); setError('') }} inputMode="decimal" placeholder="0.00" className="field tabular-nums" disabled={!!busy} />
                <span className="mt-1 block text-[12px] text-fg-faint">
                  {walletBal.state === 'ok' && selected ? pt('tr.walletBalance', { amount: formatUnits(walletBal.v!, selected.decimals), asset: selected.asset })
                    : walletBal.state === 'error' ? pt('tr.walletBalanceUnavailable') : '…'}
                </span>
              </label>
            </div>
            {error && <p role="alert" className="text-sm text-red-300 flex items-start gap-2"><IconAlert width={16} height={16} className="mt-0.5 shrink-0" />{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-300 flex items-start gap-2"><IconCheck width={16} height={16} className="mt-0.5 shrink-0" />{notice}</p>}
            <button onClick={review} disabled={!!busy || !amount} className="btn btn-solid w-full sm:w-auto">{busy === 'quote' ? <Spinner /> : null}{pt('tr.review')}</button>
          </>
        )}
      <p className="text-[12px] text-fg-faint">{pt('tr.legal')}</p>

      {list.length > 0 && (
        <div>
          <h4 className="text-[13px] font-semibold text-fg mb-2">{pt('tr.history')}</h4>
          <ul className="divide-y divide-ink-700 rounded-lg border border-ink-700">
            {list.slice(0, 10).map(x => (
              <li key={x.id} className="px-3 py-2.5 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-fg tabular-nums">{Number(x.received_amount ?? x.quoted_amount).toLocaleString(intl, { maximumFractionDigits: 8 })} {x.asset}</span>
                <span className="text-fg-faint">{networkOf(x.chain_id)?.name || x.network} · {new Date(x.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric' })}</span>
                <span className={`tag ${tone[x.status]}`}>{statusText(x)}</span>
                {x.status === 'credited' && <span className="text-emerald-300 tabular-nums">{pt('tr.credited', { amount: usd(x.credited_usd) })}</span>}
                {x.tx_hash && EXPLORER[x.chain_id] && <a href={EXPLORER[x.chain_id] + x.tx_hash} target="_blank" rel="noopener noreferrer" className="text-fg-muted underline underline-offset-2 hover:text-fg">{pt('tr.viewTx')}</a>}
                {x.error && x.status !== 'credited' && <span className="basis-full text-[12px] text-fg-faint">{x.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {quote && selected && (
        <ConfirmModal title={pt('tr.title')} confirmLabel={busy === 'wallet' ? pt('tr.waitingWallet') : pt('tr.confirm')} cancelLabel={pt('tr.cancel')}
          busy={!!busy} onCancel={cancelQuote} onConfirm={confirm}>
          <dl className="divide-y divide-ink-700 text-sm">
            <Row k={pt('tr.rowAmount')} v={`${Number(quote.quoted_amount).toLocaleString(intl, { maximumFractionDigits: 8 })} ${quote.asset}`} />
            <Row k={pt('tr.rowValue')} v={usd(quote.quoted_usd)} />
            <Row k={pt('tr.rowNetwork')} v={networkOf(quote.chain_id)?.name || quote.network} />
            <Row k={pt('tr.rowNetworkFee')} v={netFee === undefined ? '…' : netFee === null ? pt('tr.networkFeeUnknown') : pt('tr.networkFeeEst', { amount: formatUnits(netFee, 18, 8), symbol })} small />
            <Row k={pt('tr.rowServiceFee')} v={Number(quote.quoted_fee_usd) > 0 ? usd(quote.quoted_fee_usd) : pt('tr.noFee')} />
            <Row k={pt('tr.rowCredit')} v={usd(quote.quoted_credit_usd)} strong />
          </dl>
          <p className="mt-3 text-sm text-fg">{pt('tr.receive', { amount: usd(quote.quoted_credit_usd) })}</p>
          <p className="mt-2 text-[12px] text-fg-faint">{pt('tr.priceNote', { rate: usd(quote.usd_rate), asset: quote.asset })}</p>
          <p className="mt-2 text-[12px] text-fg-muted">{pt('tr.confirmNote')}</p>
        </ConfirmModal>
      )}
    </section>
  )
}

function Row({ k, v, strong, small }: { k: string; v: string; strong?: boolean; small?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-fg-muted shrink-0">{k}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-fg font-semibold' : 'text-fg'} ${small ? 'text-[12px]' : ''}`}>{v}</dd>
    </div>
  )
}


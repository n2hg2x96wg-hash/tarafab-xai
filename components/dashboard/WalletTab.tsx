'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { walletText } from '@/lib/i18n/wallet'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconAlert, IconCheck, IconCopy, IconLock, IconWallet } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'
import { fmt, type Account } from '@/components/dashboard/shared'
import {
  NETWORKS, WalletError, chainIdOf, connect, discoverWallets, nativeBalance, networkOf, shortAddress, signMessage, switchChain,
  type Eip1193, type WalletInfo,
} from '@/lib/wallet/eip1193'
import {
  clearPending, endSdkSession, readPending, readyProvider, restoredAccount, savePending, sdkProvider, walletConnectAvailable, type SdkKind,
} from '@/lib/wallet/sdkProviders'

type Linked = {
  id: string; chain_id: number; network: string; address: string; label: string; wallet_name: string
  status: 'linked' | 'unlinked' | 'revoked'; verification_status: string
  linked_at: string; verified_at: string | null; last_verified_at: string | null; ended_at: string | null; end_reason: string | null
}
// A wallet option: one injected into this browser (extension or wallet-app
// browser), or an SDK that hands off to a mobile wallet app / passkey wallet.
type Option = Omit<WalletInfo, 'provider'> & { provider?: Eip1193; sdk?: SdkKind; hint?: string }
type Session = { wallet: Option & { provider: Eip1193 }; address: string; chainId: number }
type Bal = { state: 'idle' | 'loading' | 'ok' | 'error'; amount?: string; symbol?: string; at?: number }

// Wallet Center. External, non-custodial wallets the client links by signing
// a message; Tarafab never holds or asks for their keys. Whatever an external
// wallet contains is shown as on-chain information and never changes the
// Tarafab Account Balance.
export function WalletTab({ account }: { account: Account | null }) {
  const { t: base, intl, locale } = useI18n()
  const t = useCallback((key: string, vars?: Record<string, string | number>) =>
    key.startsWith('wallet.') ? walletText(locale, key.slice(7), vars) : base(key as TKey, vars), [locale, base])
  const [linked, setLinked] = useState<Linked[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [wallets, setWallets] = useState<Option[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [targetChain, setTargetChain] = useState(1)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<'' | 'connect' | 'switch' | 'sign' | 'verify'>('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [bal, setBal] = useState<Bal>({ state: 'idle' })
  const [unlinking, setUnlinking] = useState<Linked | null>(null)
  const [unlinkBusy, setUnlinkBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState('')
  const flow = useRef(0) // bumps when the account or network changes mid-flow
  const busyFor = useRef('') // the option a connection is waiting on
  const [connecting, setConnecting] = useState<Option | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await readJson<{ wallets: Linked[] }>(await authFetch('/api/client/wallets'))
      setLinked(r.wallets); setLoadError('')
    } catch (e) { setLoadError(errorText(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  const walletMsg = (e: unknown) => {
    if (e instanceof WalletError) return t(`wallet.err.${e.code}`) + (e.code === 'failed' && e.detail ? ` (${e.detail})` : '')
    return errorText(e)
  }

  // Follow the connected wallet: an account or network change cancels any
  // verification in progress; a disconnect clears the session.
  useEffect(() => {
    const p = session?.wallet.provider
    if (!p?.on) return
    const onAccounts = (a: unknown) => {
      flow.current++
      const next = Array.isArray(a) && typeof a[0] === 'string' ? a[0].toLowerCase() : ''
      if (!next) { setSession(null); setBal({ state: 'idle' }); setError(t('wallet.disconnected')); return }
      setSession(s => (s ? { ...s, address: next } : s)); setDone(''); setError(t('wallet.accountChanged'))
    }
    const onChain = (c: unknown) => {
      flow.current++
      const id = parseInt(String(c), 16)
      setSession(s => (s ? { ...s, chainId: id } : s))
    }
    const onDisconnect = () => { flow.current++; setSession(null); setBal({ state: 'idle' }) }
    p.on('accountsChanged', onAccounts); p.on('chainChanged', onChain); p.on('disconnect', onDisconnect)
    return () => { p.removeListener?.('accountsChanged', onAccounts); p.removeListener?.('chainChanged', onChain); p.removeListener?.('disconnect', onDisconnect) }
  }, [session?.wallet, t])

  // External on-chain balance of the connected account, read through the
  // user's own wallet on its current network. Shown as external information.
  const readBalance = useCallback(async (s: Session) => {
    const net = networkOf(s.chainId)
    if (!net) { setBal({ state: 'error' }); return }
    setBal({ state: 'loading' })
    try {
      const amount = await nativeBalance(s.wallet.provider, s.address, net.decimals)
      setBal({ state: 'ok', amount, symbol: net.symbol, at: Date.now() })
    } catch { setBal({ state: 'error' }) }
  }, [])
  useEffect(() => { if (session) readBalance(session) }, [session?.address, session?.chainId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sdkOptions = useCallback((): Option[] => [
    { id: 'sdk-coinbase', name: 'Coinbase Wallet', sdk: 'coinbase', hint: t('wallet.hintCoinbase') },
    ...(walletConnectAvailable() ? [{ id: 'sdk-walletconnect', name: 'WalletConnect', sdk: 'walletconnect' as const, hint: t('wallet.hintWalletConnect') }] : []),
  ], [t])

  const openPicker = async () => {
    setError(''); setDone(''); setPicking(true); setWallets(null)
    // Finish loading the SDKs before showing their options. This keeps the
    // wallet-app handoff inside the user's later tap, which mobile Safari
    // otherwise may block if provider initialization is still in progress.
    const options = sdkOptions()
    const warmups = Promise.allSettled(options.map(o => sdkProvider(o.sdk!)))
    const injected = await discoverWallets()
    const results = await warmups
    // An injected Coinbase extension and the Coinbase SDK are the same wallet.
    const ready = options.filter((_, i) => results[i].status === 'fulfilled')
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    const sdk = ready.filter(o => !(o.sdk === 'coinbase' && injected.some(w => /coinbase/i.test(w.id + w.name))))
    setWallets([...injected, ...sdk])
    if (failed) setError(walletMsg(failed.reason))
  }

  const choose = async (w: Option) => {
    busyFor.current = w.id
    setConnecting(w)
    setBusy('connect'); setError('')
    try {
      let provider = w.provider
      if (w.sdk) {
        provider = readyProvider(w.sdk) || await sdkProvider(w.sdk)
        // Survives leaving Safari for the wallet app (see restore below).
        savePending({ kind: w.sdk, chainId: targetChain })
      }
      const my = flow.current
      const { address, chainId } = await connect(provider!)
      if (my !== flow.current) return
      setSession({ wallet: { ...w, provider: provider! }, address, chainId }); setPicking(false)
      if (networkOf(chainId)) setTargetChain(chainId)
    } catch (e) {
      if (busyFor.current !== w.id) return // cancelled from the UI; message already shown
      setError(walletMsg(e))
    } finally { if (busyFor.current === w.id) { busyFor.current = ''; clearPending(); setBusy(''); setConnecting(null) } }
  }

  // Returning from the wallet app: if the browser reloaded the page while the
  // user approved, pick the approved session back up (it never opens a wallet
  // by itself). Abandoned attempts expire after 15 minutes.
  useEffect(() => {
    const pending = readPending()
    if (!pending) return
    let alive = true
    ;(async () => {
      const address = await restoredAccount(pending.kind)
      if (!alive) return
      if (!address) { clearPending(); return }
      const provider = await sdkProvider(pending.kind)
      const chainId = await chainIdOf(provider).catch(() => pending.chainId)
      const opt = sdkOptions().find(o => o.sdk === pending.kind) || { id: 'sdk-' + pending.kind, name: pending.kind, sdk: pending.kind }
      if (!alive) return
      setSession({ wallet: { ...opt, provider }, address, chainId })
      setTargetChain(networkOf(chainId) ? chainId : pending.chainId)
      clearPending()
    })()
    return () => { alive = false }
  }, [sdkOptions])

  // Abandon a connection that is waiting on the wallet app or window (for
  // example it was closed or never opened). Ends the SDK request cleanly.
  const cancelConnect = (w?: Option | null) => {
    flow.current++
    busyFor.current = ''
    setConnecting(null)
    clearPending()
    if (w?.sdk) endSdkSession(w.sdk)
    setBusy(''); setPicking(false); setError(t('wallet.connectCancelled'))
  }

  const leaveSession = () => {
    flow.current++
    if (session?.wallet.sdk) endSdkSession(session.wallet.sdk)
    setSession(null); setBal({ state: 'idle' }); setError(''); setDone('')
  }

  const doSwitch = async () => {
    if (!session) return
    setBusy('switch'); setError('')
    try {
      await switchChain(session.wallet.provider, targetChain)
      const id = await chainIdOf(session.wallet.provider)
      setSession(s => (s ? { ...s, chainId: id } : s))
    } catch (e) { setError(walletMsg(e)) } finally { setBusy('') }
  }

  const verify = async () => {
    if (!session || busy) return
    if (session.chainId !== targetChain) { setError(t('wallet.wrongNetwork')); return }
    const my = ++flow.current
    setError(''); setDone('')
    try {
      setBusy('sign')
      const ch = await readJson<{ challenge_id: string; message: string }>(await authFetch('/api/client/wallets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', address: session.address, chain_id: targetChain }),
      }))
      const signature = await signMessage(session.wallet.provider, session.address, ch.message)
      if (my !== flow.current) throw new WalletError(t('wallet.accountChanged'), 'failed')
      setBusy('verify')
      const r = await readJson<{ status: string }>(await authFetch('/api/client/wallets/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: ch.challenge_id, address: session.address, signature, label: label.trim(), wallet_name: session.wallet.name }),
      }))
      setDone(r.status === 'reverified' ? t('wallet.reverified') : t('wallet.linkedOk'))
      setLabel('')
      await load()
    } catch (e) {
      setError(e instanceof WalletError && e.code === 'failed' && e.message === t('wallet.accountChanged') ? e.message : walletMsg(e))
    } finally { setBusy('') }
  }

  const unlink = async () => {
    if (!unlinking) return
    setUnlinkBusy(true)
    try {
      await readJson(await authFetch('/api/client/wallets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', wallet_id: unlinking.id }),
      }))
      setUnlinking(null); await load()
    } catch (e) { setError(errorText(e)); setUnlinking(null) } finally { setUnlinkBusy(false) }
  }

  const copy = (a: string) => navigator.clipboard.writeText(a).then(() => { setCopied(a); setTimeout(() => setCopied(''), 1500) }).catch(() => {})
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const live = (linked || []).filter(w => w.status === 'linked')
  const past = (linked || []).filter(w => w.status !== 'linked')
  const sessionLinked = session ? live.find(w => w.address === session.address) : undefined
  const currentNet = session ? networkOf(session.chainId) : null

  return (
    <div className="space-y-5 panel-in">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('wallet.title')}</h2>
        <p className="text-sm text-fg-faint mt-0.5">{t('wallet.subtitle')}</p>
      </div>

      {/* The two are never combined: one is Tarafab's ledger, the other is external. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <p className="text-[12px] uppercase tracking-[0.12em] text-fg-faint">{t('dash.accountBalance')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{account ? `$${fmt(account.available_balance)}` : '—'}</p>
          <p className="mt-1 text-[12px] text-fg-faint">{t('wallet.accountNote')}</p>
        </div>
        <div className="panel p-4 sm:p-5">
          <p className="text-[12px] uppercase tracking-[0.12em] text-fg-faint">{t('wallet.externalTitle')}</p>
          {!session ? (
            <p className="mt-2 text-sm text-fg-muted">{t('wallet.externalConnect')}</p>
          ) : bal.state === 'loading' ? (
            <p className="mt-2 text-sm text-fg-muted flex items-center gap-2"><Spinner /> {t('wallet.balanceLoading')}</p>
          ) : bal.state === 'ok' ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg break-all">{bal.amount} <span className="text-base text-fg-muted">{bal.symbol}</span></p>
              <p className="mt-1 text-[12px] text-fg-faint">
                {t('wallet.onChainOn', { network: currentNet?.name || '' })} · {shortAddress(session.address)} · {t('wallet.updatedAt', { time: new Date(bal.at!).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) })}
                {' · '}<button onClick={() => readBalance(session)} className="underline underline-offset-2 hover:text-fg">{t('common.refresh')}</button>
              </p>
              <p className="mt-1 text-[12px] text-fg-faint">{t('wallet.noFiat')}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">{currentNet ? t('wallet.balanceUnavailable') : t('wallet.unsupportedNetwork')}</p>
          )}
        </div>
      </div>

      {/* Connect and verify */}
      <div className="panel p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-fg-muted shrink-0"><IconWallet width={18} height={18} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-fg">{t('wallet.connectTitle')}</h3>
            <p className="text-sm text-fg-muted mt-0.5">{t('wallet.connectBody')}</p>
          </div>
        </div>

        {!session ? (
          <div className="mt-4">
            {!picking ? (
              <button onClick={openPicker} className="btn btn-solid w-full sm:w-auto">{t('wallet.connect')}</button>
            ) : wallets === null ? (
              <p className="text-sm text-fg-muted flex items-center gap-2"><Spinner /> {t('wallet.looking')}</p>
            ) : wallets.length === 0 ? (
              <div className="alert alert-info text-sm" role="status">
                <span>{t('wallet.noneFound')}</span>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label={t('wallet.choose')}>
                {wallets.map(w => (
                  <li key={w.id}>
                    <button disabled={!!busy} onClick={() => choose(w)} className="w-full flex items-center gap-3 rounded-lg border border-ink-700 hover:border-ink-500 bg-ink-900/40 px-3 py-3 text-left transition-colors disabled:opacity-60">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the wallet's own data: icon, not a remote image */}
                      {w.icon ? <img src={w.icon} alt="" width={28} height={28} className="rounded" /> : <IconWallet width={22} height={22} />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-fg truncate">{w.name}</span>
                        {w.hint && <span className="block text-[12px] text-fg-faint">{w.hint}</span>}
                      </span>
                      {busy === 'connect' && <Spinner />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {busy === 'connect' && connecting ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-fg-muted" role="status">
                <Spinner /> <span className="flex-1 min-w-[12rem]">{t('wallet.waitingWallet', { wallet: connecting.name })}</span>
                <button onClick={() => cancelConnect(connecting)} className="btn btn-sm btn-outline">{t('wallet.cancel')}</button>
              </div>
            ) : picking && <button onClick={() => setPicking(false)} className="mt-3 text-[13px] text-fg-faint hover:text-fg">{t('wallet.cancel')}</button>}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="text-sm font-medium text-fg">{session.wallet.name}</span>
              <span className="font-mono text-[13px] text-fg-muted break-all">{session.address}</span>
              <span className="text-[12px] text-fg-faint">{currentNet ? currentNet.name : t('wallet.unknownChain', { id: session.chainId })}</span>
              {sessionLinked && <span className="tag text-emerald-400 border-emerald-500/30">{t('wallet.statusVerified')}</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[13px] text-fg-muted mb-1.5">{t('wallet.network')}</span>
                <select value={targetChain} onChange={e => setTargetChain(Number(e.target.value))} className="field">
                  {NETWORKS.map(n => <option key={n.chainId} value={n.chainId}>{n.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-fg-muted mb-1.5">{t('wallet.label')}</span>
                <input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder={t('wallet.labelPh')} className="field" />
              </label>
            </div>

            {session.chainId !== targetChain && (
              <div className="alert alert-warning text-sm flex flex-wrap items-center gap-3" role="status">
                <span className="flex-1 min-w-[12rem]">{t('wallet.switchNeeded', { network: networkOf(targetChain)?.name || '' })}</span>
                <button onClick={doSwitch} disabled={!!busy} className="btn btn-sm btn-outline">{busy === 'switch' ? <Spinner /> : t('wallet.switch')}</button>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={leaveSession} disabled={busy === 'verify'} className="btn btn-ghost">{t('wallet.useAnother')}</button>
              <button onClick={verify} disabled={!!busy || session.chainId !== targetChain} className="btn btn-solid sm:ml-auto">
                {busy === 'sign' ? <><Spinner /> {t('wallet.waitingSignature')}</> : busy === 'verify' ? <><Spinner /> {t('wallet.verifying')}</> : sessionLinked ? t('wallet.reverify') : t('wallet.verify')}
              </button>
            </div>
            <p className="text-[12px] text-fg-faint">{t('wallet.signNote')}</p>
          </div>
        )}

        {error && <div role="alert" className="alert alert-danger mt-4 text-sm"><IconAlert width={16} height={16} className="shrink-0 mt-px" /><span>{error}</span></div>}
        {done && <div role="status" className="alert alert-success mt-4 text-sm"><IconCheck width={16} height={16} className="shrink-0 mt-px" /><span>{done}</span></div>}
      </div>

      {/* Linked wallets */}
      <div className="panel overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-ink-700/70 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-fg">{t('wallet.linkedTitle')}</h3>
          <span className="text-[12px] text-fg-faint">{live.length}</span>
        </div>
        {linked === null && !loadError ? (
          <div className="p-6 flex justify-center"><Spinner /></div>
        ) : loadError ? (
          <div className="p-5 text-sm text-fg-muted flex flex-wrap items-center gap-3"><span>{loadError}</span><button onClick={load} className="btn btn-sm btn-outline">{t('common.tryAgain')}</button></div>
        ) : live.length === 0 ? (
          <div className="px-6 py-10 text-center"><p className="text-sm text-fg">{t('wallet.noneLinked')}</p><p className="text-[13px] text-fg-faint mt-1">{t('wallet.noneLinkedBody')}</p></div>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {live.map(w => (
              <li key={w.id} className="px-4 sm:px-5 py-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{w.label || w.wallet_name || t('wallet.externalWallet')} <span className="text-fg-faint font-normal">· {w.network}</span></p>
                    <button onClick={() => copy(w.address)} className="mt-0.5 font-mono text-[12px] text-fg-muted hover:text-fg break-all text-left inline-flex items-center gap-1.5" title={t('common.copy')}>
                      {w.address} <IconCopy width={12} height={12} />
                    </button>
                    {copied === w.address && <span className="ml-2 text-[11px] text-emerald-400">{t('common.copied')}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag text-emerald-400 border-emerald-500/30">{t('wallet.statusConnected')}</span>
                    <span className="tag text-sky-400 border-sky-500/30">{t('wallet.statusVerified')}</span>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[12px]">
                  <div><dt className="text-fg-faint">{t('wallet.walletApp')}</dt><dd className="text-fg-muted">{w.wallet_name || '—'}</dd></div>
                  <div><dt className="text-fg-faint">{t('wallet.linkedOn')}</dt><dd className="text-fg-muted">{date(w.linked_at)}</dd></div>
                  <div><dt className="text-fg-faint">{t('wallet.lastVerified')}</dt><dd className="text-fg-muted">{date(w.last_verified_at)}</dd></div>
                  <div className="flex items-end sm:justify-end"><button onClick={() => setUnlinking(w)} className="text-[12px] text-red-400 hover:text-red-300">{t('wallet.disconnect')}</button></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <div className="border-t border-ink-700/70">
            <button onClick={() => setShowHistory(s => !s)} className="w-full px-4 sm:px-5 py-3 text-left text-[13px] text-fg-muted hover:text-fg" aria-expanded={showHistory}>
              {t('wallet.history', { n: past.length })}
            </button>
            {showHistory && (
              <ul className="divide-y divide-ink-700/60">
                {past.map(w => (
                  <li key={w.id} className="px-4 sm:px-5 py-3 text-[12px] text-fg-muted flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-mono break-all">{shortAddress(w.address)}</span>
                    <span>{w.network}</span>
                    <span className="tag text-fg-faint border-ink-600">{w.status === 'revoked' ? t('wallet.statusRevoked') : t('wallet.statusUnlinked')}</span>
                    <span>{date(w.ended_at)}</span>
                    {w.status === 'revoked' && w.end_reason && <span className="w-full text-fg-faint">{w.end_reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-[12px] text-fg-faint">
        <IconLock width={14} height={14} className="shrink-0 mt-px" />
        <span>{t('wallet.securityNote')}</span>
      </p>

      {unlinking && (
        <ConfirmModal title={t('wallet.disconnectTitle')} confirmLabel={t('wallet.disconnect')} cancelLabel={t('wallet.cancel')} busy={unlinkBusy} onConfirm={unlink} onCancel={() => setUnlinking(null)}>
          <p>{t('wallet.disconnectBody', { address: shortAddress(unlinking.address), network: unlinking.network })}</p>
        </ConfirmModal>
      )}
    </div>
  )
}

export type { Eip1193 }

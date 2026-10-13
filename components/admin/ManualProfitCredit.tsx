'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'

// Admin: Manual Profit Credit. Records one profit credit for one client with
// an effective date, without creating or changing any investment's terms.
// The database function (admin_manual_profit_credit) checks admin rights,
// validates every field, posts one ledger entry, updates the profit balance,
// writes the admin record, the audit log and the client's notification in one
// database transaction, and returns the existing credit for a repeated
// request key. The checks below only give earlier, clearer messages.

export type CreditClient = { id: string; full_name: string | null; email?: string | null; created_at: string }
export type Classification = 'investment_return' | 'profit_distribution' | 'profit_allocation'

export const CLASSIFICATIONS: { id: Classification; title: string; hint: string; client: string }[] = [
  {
    id: 'investment_return', title: 'Verified investment return',
    hint: 'A return earned by one of this client’s investments. Linked to that investment; its terms are not changed.',
    client: 'Profit · Investment return',
  },
  {
    id: 'profit_distribution', title: 'Documented profit distribution',
    hint: 'A profit distribution supported by your records. Not linked to an investment.',
    client: 'Profit distribution',
  },
  {
    id: 'profit_allocation', title: 'Other authorized profit allocation',
    hint: 'Another authorized profit credit. Not linked to an investment.',
    client: 'Profit credit received',
  },
]

type Investment = { id: string; reference: string | null; status: string; principal: number; profit_amount: number | null; start_date: string | null }

export type CreditResult = {
  duplicate: boolean
  transaction_id: string
  reference: string
  amount: number
  currency: string
  classification: Classification
  effective_at: string
  posted_at: string
  profit_balance_before: number | null
  profit_balance_after: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// A calendar date (YYYY-MM-DD) in words, without time-zone shifts.
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/

export function ManualProfitCreditForm({ client, profitBalance, onPosted }: {
  client: CreditClient
  profitBalance?: number | null
  onPosted?: (r: CreditResult) => void
}) {
  const today = localToday()
  const opened = localDay(client.created_at) < '2020-01-01' ? '2020-01-01' : localDay(client.created_at)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [classification, setClassification] = useState<Classification | ''>('')
  const [investmentId, setInvestmentId] = useState('')
  const [reason, setReason] = useState('')
  const [backdate, setBackdate] = useState('')
  const [investments, setInvestments] = useState<Investment[] | null>(null)
  const [invError, setInvError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreditResult | null>(null)
  // One key per credit: an unchanged form retried after a network error keeps
  // its key and is posted once; any change to the form makes a new credit.
  const key = useRef(newRequestKey())
  useEffect(() => { key.current = newRequestKey() }, [client.id, amount, date, classification, investmentId, reason, backdate])

  // A different client starts a clean form.
  useEffect(() => {
    setAmount(''); setDate(localToday()); setClassification(''); setInvestmentId(''); setReason(''); setBackdate('')
    setInvestments(null); setError(''); setResult(null); setConfirming(false)
  }, [client.id])

  // The client's investments that can carry a return.
  useEffect(() => {
    if (classification !== 'investment_return' || investments) return
    let live = true
    setInvError('')
    ;(createClient().from('client_investments') as any)
      .select('id, reference, status, principal, profit_amount, start_date')
      .eq('user_id', client.id).in('status', ['active', 'completed', 'matured'])
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data, error: e }: { data: Investment[] | null; error: unknown }) => {
        if (!live) return
        if (e) setInvError('The client’s investments could not be loaded.')
        else setInvestments(data || [])
      })
    return () => { live = false }
  }, [classification, client.id, investments])

  const backdated = !!date && date < today
  const cls = CLASSIFICATIONS.find(c => c.id === classification)
  const inv = investments?.find(i => i.id === investmentId)

  const validate = () => {
    if (!AMOUNT.test(amount.trim()) || Number(amount) <= 0) return 'Enter an amount greater than zero, with at most 2 decimal places.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose an effective date.'
    if (date > today) return 'The effective date cannot be in the future.'
    if (date < opened) return 'The effective date cannot be before the client’s account was opened.'
    if (!classification) return 'Choose what this credit is.'
    if (classification === 'investment_return' && !investmentId) return 'Choose the investment this return belongs to.'
    if (reason.trim().length < 5) return 'Enter a reason or reference (at least 5 characters).'
    if (backdated && backdate.trim().length < 5) return 'Explain why the effective date is earlier than today (at least 5 characters).'
    return ''
  }

  const review = () => {
    const v = validate()
    setError(v)
    if (!v) setConfirming(true)
  }

  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { credit } = await readJson<{ credit: CreditResult }>(await authFetch('/api/admin/profit-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current },
        body: JSON.stringify({
          user_id: client.id,
          amount: amount.trim(),
          effective_date: date,
          classification,
          investment_id: classification === 'investment_return' ? investmentId : null,
          reason: reason.trim(),
          backdate_reason: backdated ? backdate.trim() : null,
          tz_offset_min: new Date().getTimezoneOffset(),
        }),
      }))
      setResult(credit)
      setConfirming(false)
      key.current = newRequestKey()
      onPosted?.(credit)
    } catch (e) {
      setConfirming(false)
      setError(errorText(e))
      // A refusal (not a lost connection) means this exact request will not
      // succeed as is; the next attempt is a new request.
      if (e instanceof RequestError && e.status >= 400) key.current = newRequestKey()
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setAmount(''); setDate(localToday()); setClassification(''); setInvestmentId(''); setReason(''); setBackdate('')
    setError(''); setResult(null); setInvestments(null)
  }

  if (result) {
    const c = CLASSIFICATIONS.find(x => x.id === result.classification)
    return (
      <div data-mpc-result className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
        <p className="text-sm font-semibold text-emerald-300">{result.duplicate ? 'This credit was already recorded' : 'Profit credit recorded'}</p>
        <p className="text-xs text-slate-400 mt-1">{result.duplicate ? 'The same request was received again; nothing new was posted.' : 'Posted once to the client’s profit balance. The client has been notified.'}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Reference" v={<span className="font-mono">{result.reference}</span>} />
          <Row k="Client" v={client.full_name || 'Unnamed client'} />
          <Row k="Amount" v={`${usd(result.amount)} ${result.currency}`} />
          <Row k="Classification" v={c?.title} />
          <Row k="Effective date" v={fmtDate(result.effective_at)} />
          <Row k="Posted (server time)" v={fmtDateTime(result.posted_at)} />
          {result.profit_balance_before !== null && <Row k="Profit balance" v={<span className="tabular-nums">{usd(result.profit_balance_before)} → <span className="text-emerald-300">{usd(result.profit_balance_after)}</span></span>} />}
        </dl>
        <button type="button" onClick={reset} className="mt-5 w-full sm:w-auto text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl">Record another credit</button>
      </div>
    )
  }

  return (
    <div data-mpc-form>
      {error && <div role="alert" className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      <div className="space-y-4">
        <div>
          <label htmlFor="mpc-amount" className="block text-xs font-medium text-slate-400 mb-1.5">Amount (USD)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">$</span>
            <input id="mpc-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy}
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" className="input-field text-sm pl-7 tabular-nums" />
          </div>
          {profitBalance !== undefined && profitBalance !== null && AMOUNT.test(amount.trim()) && Number(amount) > 0 && (
            <p className="text-xs text-slate-500 mt-1.5">Profit balance: <span className="text-white">{usd(profitBalance)}</span> → <span className="text-emerald-400 font-medium">{usd(profitBalance + Number(amount))}</span></p>
          )}
        </div>

        <div>
          <label htmlFor="mpc-date" className="block text-xs font-medium text-slate-400 mb-1.5">Effective date</label>
          <input id="mpc-date" type="date" value={date} min={opened} max={today} disabled={busy}
            onChange={e => setDate(e.target.value)} className="input-field text-sm" />
          <p className="text-[11px] text-slate-500 mt-1">The date the credit applies to; the client sees this date. The actual posting time is recorded separately and never replaced.</p>
        </div>

        {backdated && (
          <div>
            <label htmlFor="mpc-backdate" className="block text-xs font-medium text-amber-300 mb-1.5">Why is the effective date earlier than today?</label>
            <textarea id="mpc-backdate" rows={2} maxLength={500} value={backdate} disabled={busy}
              onChange={e => setBackdate(e.target.value)} placeholder="e.g. Distribution approved on this date, recorded late" className="input-field resize-none text-sm" />
            <p className="text-[11px] text-slate-500 mt-1">Required for an earlier date. Kept in the audit log; not shown to the client.</p>
          </div>
        )}

        <fieldset>
          <legend className="block text-xs font-medium text-slate-400 mb-1.5">What is this credit?</legend>
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Credit classification">
            {CLASSIFICATIONS.map(c => {
              const on = classification === c.id
              return (
                <button key={c.id} type="button" role="radio" aria-checked={on} disabled={busy} data-mpc-class={c.id}
                  onClick={() => { setClassification(c.id); if (c.id !== 'investment_return') setInvestmentId('') }}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-white/[0.08] hover:border-white/20'}`}>
                  <span className={`block text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{on ? '● ' : ''}{c.title}</span>
                  <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{c.hint}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Not for loyalty rewards, promotional credits or balance corrections: use <span className="text-slate-300">Balance actions → Adjust profit balance</span> for those.</p>
        </fieldset>

        {classification === 'investment_return' && (
          <div>
            <label htmlFor="mpc-inv" className="block text-xs font-medium text-slate-400 mb-1.5">Investment</label>
            {invError ? <p role="alert" className="text-xs text-red-400">{invError}</p>
              : !investments ? <p className="text-xs text-slate-500">Loading investments…</p>
              : investments.length === 0 ? <p className="text-xs text-amber-300">This client has no active or completed investment. A return can only be recorded against an existing investment; choose another classification only if it truly applies.</p>
              : (
                <select id="mpc-inv" value={investmentId} disabled={busy} onChange={e => setInvestmentId(e.target.value)} className="input-field text-sm">
                  <option value="">Choose an investment</option>
                  {investments.map(i => (
                    <option key={i.id} value={i.id}>{i.reference || i.id.slice(0, 8)} · {usd(i.principal)} · {i.status}</option>
                  ))}
                </select>
              )}
            <p className="text-[11px] text-slate-500 mt-1">Adds to that investment’s recorded return. Principal, rate, dates and status are not changed.</p>
          </div>
        )}

        <div>
          <label htmlFor="mpc-reason" className="block text-xs font-medium text-slate-400 mb-1.5">Reason or reference <span className="text-slate-500 font-normal">· {classification === 'investment_return' ? 'audit log and investment history' : 'shown to the client beneath the entry'}</span></label>
          <textarea id="mpc-reason" rows={3} maxLength={500} value={reason} disabled={busy}
            onChange={e => setReason(e.target.value)} placeholder="e.g. Q3 distribution, board approval ref. 2026-09" className="input-field resize-none text-sm" />
        </div>
      </div>

      <button type="button" onClick={review} disabled={busy || !amount || !classification || !reason.trim()} data-mpc-review
        className="w-full mt-6 py-3.5 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
        Review credit
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="mpc-confirm-title">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setConfirming(false)} />
          <div className="relative z-10 glass w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <h3 id="mpc-confirm-title" className="text-base font-bold text-white">Confirm manual profit credit</h3>
            <p className="text-xs text-slate-500 mt-1">This posts one credit to the client’s profit balance and notifies the client. A posted credit is not deleted; corrections go through the existing correction process.</p>
            <dl className="mt-4 rounded-xl bg-white/[0.03] p-4 space-y-2 text-sm" data-mpc-confirm>
              <Row k="Client" v={<>{client.full_name || 'Unnamed client'}{client.email && <span className="block text-[11px] text-slate-500 break-all">{client.email}</span>}</>} />
              <Row k="Amount" v={<span className="tabular-nums">+{usd(Number(amount))}</span>} />
              <Row k="Currency" v="USD" />
              <Row k="Effective date" v={<>{longDate(date)}{backdated && <span className="block text-[11px] text-amber-300">Earlier than today</span>}</>} />
              <Row k="Classification" v={cls?.title} />
              {inv && <Row k="Investment" v={inv.reference || inv.id.slice(0, 8)} />}
              <Row k="Reason" v={<span className="text-xs">{reason.trim()}</span>} />
              {backdated && <Row k="Why earlier" v={<span className="text-xs">{backdate.trim()}</span>} />}
              {profitBalance !== undefined && profitBalance !== null && <Row k="Profit balance" v={<span className="tabular-nums">{usd(profitBalance)} → <span className="text-emerald-400">{usd(profitBalance + Number(amount))}</span></span>} />}
              <div className="pt-2 mt-1 border-t border-white/[0.06] space-y-1 text-xs">
                <Row k="Client sees" v={classification === 'investment_return' ? cls?.client : `${cls?.client} — ${reason.trim()}`} />
                <Row k="Posting time" v="Recorded by the server when you confirm" />
              </div>
            </dl>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex-1 text-sm text-slate-300 border border-white/[0.1] rounded-xl px-4 py-3">Cancel</button>
              <button type="button" onClick={submit} disabled={busy} data-mpc-confirm-btn className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-3 disabled:opacity-60">{busy ? 'Posting…' : 'Confirm credit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400 shrink-0">{k}</dt>
      <dd className="text-white text-right min-w-0 break-words">{v}</dd>
    </div>
  )
}

type HistoryRow = {
  id: string
  user_id: string
  admin_id: string
  amount: number
  currency: string
  classification: Classification
  reason: string
  backdate_reason: string | null
  effective_at: string
  posted_at: string
  profit_balance_before: number | null
  profit_balance_after: number | null
  transactions: { reference: string | null } | null
  client_investments: { reference: string | null } | null
}

// Recorded manual profit credits (admin only; the table is readable by
// admins alone). Shows the effective date and the posting time separately.
export function ManualProfitCreditHistory({ clientId, refreshKey = 0, limit = 25 }: { clientId?: string; refreshKey?: number; limit?: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const sb = createClient()
    let q = (sb.from('manual_profit_credits') as any)
      .select('id, user_id, admin_id, amount, currency, classification, reason, backdate_reason, effective_at, posted_at, profit_balance_before, profit_balance_after, transactions(reference), client_investments(reference)')
      .order('posted_at', { ascending: false }).limit(limit)
    if (clientId) q = q.eq('user_id', clientId)
    ;(q as Promise<{ data: HistoryRow[] | null; error: unknown }>).then(async ({ data, error: e }) => {
      if (!live) return
      if (e) { setError('Recorded credits could not be loaded.'); return }
      setError('')
      setRows(data || [])
      const ids = Array.from(new Set((data || []).flatMap(r => [r.user_id, r.admin_id])))
      if (!ids.length) return
      const { data: ps } = await (sb.from('profiles') as any).select('id, full_name').in('id', ids) as { data: { id: string; full_name: string | null }[] | null }
      if (live) setNames(new Map((ps || []).map(p => [p.id, p.full_name || 'Unnamed'])))
    })
    return () => { live = false }
  }, [clientId, refreshKey, limit])

  if (error) return <p role="alert" className="text-xs text-red-400">{error}</p>
  if (!rows) return <p className="text-xs text-slate-500">Loading…</p>
  if (!rows.length) return <p className="text-xs text-slate-500" data-mpc-history-empty>No manual profit credits recorded{clientId ? ' for this client' : ''} yet.</p>

  return (
    <ul className="divide-y divide-white/[0.06]" data-mpc-history>
      {rows.map(r => (
        <li key={r.id} className="py-3 text-sm" data-mpc-row>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-medium">{CLASSIFICATIONS.find(c => c.id === r.classification)?.title}</p>
              <p className="text-[11px] text-slate-500 font-mono">{r.transactions?.reference || '—'}{r.client_investments?.reference ? ` · ${r.client_investments.reference}` : ''}</p>
              {!clientId && <Link href={`/admin/clients/${r.user_id}`} className="text-[12px] text-accent hover:text-accent-hover">{names.get(r.user_id) || 'Client'}</Link>}
            </div>
            <p className="text-emerald-300 font-semibold tabular-nums shrink-0">+{usd(r.amount)} <span className="text-[10px] text-slate-500 font-normal">{r.currency}</span></p>
          </div>
          <dl className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            <div className="flex gap-1.5"><dt className="text-slate-500">Effective</dt><dd className="text-slate-200">{fmtDate(r.effective_at)}</dd></div>
            <div className="flex gap-1.5"><dt className="text-slate-500">Posted</dt><dd className="text-slate-300">{fmtDateTime(r.posted_at)}</dd></div>
            <div className="flex gap-1.5"><dt className="text-slate-500">By</dt><dd className="text-slate-300">{names.get(r.admin_id) || 'Admin'}</dd></div>
            {r.profit_balance_before !== null && <div className="flex gap-1.5"><dt className="text-slate-500">Profit balance</dt><dd className="text-slate-300 tabular-nums">{usd(r.profit_balance_before)} → {usd(r.profit_balance_after)}</dd></div>}
          </dl>
          <p className="text-[11px] text-slate-400 mt-1 break-words">{r.reason}</p>
          {r.backdate_reason && <p className="text-[11px] text-amber-300/80 mt-0.5 break-words">Earlier date: {r.backdate_reason}</p>}
        </li>
      ))}
    </ul>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'
import {
  AMOUNT, blankDate, blankSupport, ConfirmSheet, dateBody, DateSummary, EffectiveDateFields, fmtDate, fmtDateTime, Row,
  supportBody, SupportFields, SupportSummary, usd, validateDate, type DateState, type SupportState,
} from '@/components/admin/ManualProfitFields'
import type { ProfitSnapshot } from '@/components/admin/ManualProfitPanel'

export { usd, fmtDate, fmtDateTime }

// Admin: Manual Profit Credit. Records one profit credit for one client with
// an effective date, without creating or changing any investment's terms.
// The database function (admin_manual_profit_credit_v2) checks admin rights,
// validates every field (historical and pre-opening rules, duplicate
// references), posts one ledger entry, updates the profit balance, writes the
// admin record, the audit log and the client's notification in one database
// transaction, and returns the existing credit for a repeated request key.
// The checks below only give earlier, clearer messages.

export type CreditClient = { id: string; full_name: string | null; email?: string | null; created_at: string }
export type Classification = 'investment_return' | 'profit_distribution' | 'profit_allocation' | 'debit_reversal'

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
    id: 'profit_allocation', title: 'Other authorized profit credit',
    hint: 'Another authorized profit credit. Not linked to an investment.',
    client: 'Profit Credit',
  },
  {
    id: 'debit_reversal', title: 'Correction of an earlier manual debit',
    hint: 'Gives back all or part of a manual profit debit recorded in error. Linked to that debit.',
    client: 'Profit Balance Correction',
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
  historical?: boolean
  pre_opening_exception?: boolean
  profit_balance_before: number | null
  profit_balance_after: number | null
}

export function ManualProfitCreditForm({ client, profitBalance, snapshot, onPosted }: {
  client: CreditClient
  profitBalance?: number | null
  snapshot?: ProfitSnapshot | null
  onPosted?: (r: CreditResult) => void
}) {
  const [amount, setAmount] = useState('')
  const [d, setD] = useState<DateState>(blankDate)
  const [s, setS] = useState<SupportState>(blankSupport)
  const [classification, setClassification] = useState<Classification | ''>('')
  const [investmentId, setInvestmentId] = useState('')
  const [reverses, setReverses] = useState('')
  const [description, setDescription] = useState('')
  const [investments, setInvestments] = useState<Investment[] | null>(null)
  const [invError, setInvError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreditResult | null>(null)
  // One key per credit: an unchanged form retried after a network error keeps
  // its key and is posted once; any change to the form makes a new credit.
  const key = useRef(newRequestKey())
  useEffect(() => { key.current = newRequestKey() }, [client.id, amount, d, s, classification, investmentId, reverses, description])

  const clear = () => {
    setAmount(''); setD(blankDate()); setS(blankSupport()); setClassification(''); setInvestmentId(''); setReverses(''); setDescription('')
    setError(''); setResult(null); setConfirming(false)
  }
  // A different client starts a clean form.
  useEffect(() => { clear(); setInvestments(null) }, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const balance = snapshot?.profit_balance ?? profitBalance ?? null
  const cls = CLASSIFICATIONS.find(c => c.id === classification)
  const inv = investments?.find(i => i.id === investmentId)
  const debits = snapshot?.correctable_debits || []
  const rev = debits.find(x => x.reference === reverses)
  const n = Number(amount)

  const validate = () => {
    if (!AMOUNT.test(amount.trim()) || n <= 0) return 'Enter an amount greater than zero, with at most 2 decimal places.'
    if (!classification) return 'Choose what this credit is.'
    if (classification === 'investment_return' && !investmentId) return 'Choose the investment this return belongs to.'
    if (classification === 'debit_reversal') {
      if (!rev) return 'Choose the debit this corrects.'
      if (n > Number(rev.remaining)) return `Only ${usd(rev.remaining)} of that debit is left to correct.`
      if (d.date < rev.effective_at.slice(0, 10)) return 'A correction cannot be dated before the entry it corrects.'
    }
    const dv = validateDate(d, client.created_at, s)
    if (dv) return dv
    if (description.trim().length < 5) return 'Enter a description (at least 5 characters).'
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
          classification,
          investment_id: classification === 'investment_return' ? investmentId : null,
          reverses_reference: classification === 'debit_reversal' ? reverses : null,
          description: description.trim(),
          ...dateBody(d, client.created_at),
          ...supportBody(s),
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
          <Row k="Effective date" v={<>{fmtDate(result.effective_at)}{result.historical && <span className="block text-[11px] text-amber-300">Historical entry</span>}{result.pre_opening_exception && <span className="block text-[11px] text-amber-300">Pre-opening exception</span>}</>} />
          <Row k="Posted (server time)" v={fmtDateTime(result.posted_at)} />
          {result.profit_balance_before !== null && <Row k="Profit balance" v={<span className="tabular-nums">{usd(result.profit_balance_before)} → <span className="text-emerald-300">{usd(result.profit_balance_after)}</span></span>} />}
        </dl>
        <button type="button" onClick={clear} className="mt-5 w-full sm:w-auto text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl">Record another credit</button>
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
          {balance !== null && AMOUNT.test(amount.trim()) && n > 0 && (
            <p className="text-xs text-slate-500 mt-1.5">Profit balance: <span className="text-white">{usd(balance)}</span> → <span className="text-emerald-400 font-medium">{usd(balance + n)}</span></p>
          )}
        </div>

        <fieldset>
          <legend className="block text-xs font-medium text-slate-400 mb-1.5">What is this credit?</legend>
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Credit classification">
            {CLASSIFICATIONS.map(c => {
              const on = classification === c.id
              const off = c.id === 'debit_reversal' && !debits.length
              return (
                <button key={c.id} type="button" role="radio" aria-checked={on} disabled={busy || off} data-mpc-class={c.id}
                  onClick={() => { setClassification(c.id); if (c.id !== 'investment_return') setInvestmentId(''); if (c.id !== 'debit_reversal') setReverses('') }}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-white/[0.08] hover:border-white/20'}`}>
                  <span className={`block text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{on ? '● ' : ''}{c.title}</span>
                  {(on || off) && <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{off ? 'No manual debit of this client is left to correct.' : c.hint}</span>}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Loyalty or promotional credits: use <span className="text-slate-300">Balance actions</span>.</p>
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
            <p className="text-[11px] text-slate-500 mt-1">The investment’s terms are not changed.</p>
          </div>
        )}

        {classification === 'debit_reversal' && (
          <div>
            <label htmlFor="mpc-rev" className="block text-xs font-medium text-slate-400 mb-1.5">Debit being corrected</label>
            <select id="mpc-rev" value={reverses} disabled={busy} onChange={e => setReverses(e.target.value)} className="input-field text-sm" data-mpc-reverses>
              <option value="">Choose a manual debit</option>
              {debits.map(x => (
                <option key={x.reference} value={x.reference}>{x.reference} · {usd(x.amount)} · {fmtDate(x.effective_at)} · {usd(x.remaining)} left</option>
              ))}
            </select>
          </div>
        )}

        <EffectiveDateFields prefix="mpc" value={d} onChange={setD} openedAt={client.created_at} busy={busy} kind="credit" />

        <div>
          <label htmlFor="mpc-reason" className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-500 font-normal">· shown to the client</span></label>
          <textarea id="mpc-reason" rows={2} maxLength={500} value={description} disabled={busy}
            onChange={e => setDescription(e.target.value)} placeholder="e.g. Q3 profit distribution" className="input-field resize-none text-sm" />
        </div>

        <SupportFields prefix="mpc" value={s} onChange={setS} busy={busy} required={false} onError={setError} />
      </div>

      <button type="button" onClick={review} disabled={busy || !amount || !classification || !description.trim()} data-mpc-review
        className="w-full mt-5 py-3 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
        Review credit
      </button>

      {confirming && (
        <ConfirmSheet id="mpc-confirm" title="Confirm manual profit credit" busy={busy} onCancel={() => setConfirming(false)} onConfirm={submit} confirmLabel="Confirm credit"
          intro="This posts one credit to the client’s profit balance and notifies the client. A posted credit is never deleted or edited; a mistake is corrected with a linked debit.">
          <dl className="mt-4 rounded-xl bg-white/[0.03] p-4 space-y-2 text-sm" data-mpc-confirm>
            <Row k="Client" v={<>{client.full_name || 'Unnamed client'}{client.email && <span className="block text-[11px] text-slate-500 break-all">{client.email}</span>}</>} />
            <Row k="Amount" v={<span className="tabular-nums">+{usd(n)} USD</span>} />
            <Row k="Classification" v={cls?.title} />
            {inv && <Row k="Investment" v={inv.reference || inv.id.slice(0, 8)} />}
            {rev && <Row k="Corrects" v={<span className="font-mono text-xs">{rev.reference}</span>} />}
            <DateSummary d={d} openedAt={client.created_at} />
            <Row k="Description" v={<span className="text-xs">{description.trim()}</span>} />
            <SupportSummary s={s} />
            {balance !== null && <Row k="Profit balance" v={<span className="tabular-nums">{usd(balance)} → <span className="text-emerald-400">{usd(balance + n)}</span></span>} />}
            <div className="pt-2 mt-1 border-t border-white/[0.06] space-y-1 text-xs">
              <Row k="Client sees" v={classification === 'investment_return' ? cls?.client : `${cls?.client} — ${description.trim()}`} />
              <Row k="Notification" v="Profit Credit Notification" />
              <Row k="Posting time" v="Recorded by the server when you confirm" />
            </div>
          </dl>
        </ConfirmSheet>
      )}
    </div>
  )
}

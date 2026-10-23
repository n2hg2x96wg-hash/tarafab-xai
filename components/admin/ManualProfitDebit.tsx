'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'
import {
  AMOUNT, blankDate, blankSupport, ConfirmSheet, dateBody, dateRules, DateSummary, EffectiveDateFields, fmtDate, fmtDateTime, Row,
  supportBody, SupportFields, SupportSummary, usd, validateDate, type DateState, type SupportState,
} from '@/components/admin/ManualProfitFields'
import type { CreditClient } from '@/components/admin/ManualProfitCredit'
import type { ProfitSnapshot } from '@/components/admin/ManualProfitPanel'

// Admin: Manual Profit Debit. Lowers one client's profit balance by an
// authorized amount with an effective date. Investments, deposits and the
// other balances are never changed. The database function
// (admin_manual_profit_debit) checks admin rights, locks the account, refuses
// a debit above the available profit balance (withdrawals already requested
// stay reserved), posts one ledger entry, writes the admin record, the audit
// log and the client's notification in one database transaction, and returns
// the existing debit for a repeated request key. A debit is never presented to
// the client as a withdrawal they asked for.

export type DebitCategory = 'credit_reversal' | 'balance_correction' | 'payout' | 'authorized_charge' | 'other'

export const DEBIT_CATEGORIES: { id: DebitCategory; title: string; hint: string; client: string; needsSupport: boolean }[] = [
  {
    id: 'credit_reversal', title: 'Reversal of an earlier profit credit',
    hint: 'Takes back all or part of a profit credit recorded in error. Linked to that credit, which stays on record.',
    client: 'Profit Balance Correction', needsSupport: false,
  },
  {
    id: 'balance_correction', title: 'Profit balance correction',
    hint: 'Corrects the recorded profit balance where no single credit is being reversed.',
    client: 'Profit Balance Correction', needsSupport: false,
  },
  {
    id: 'payout', title: 'Profit paid out to the client',
    hint: 'Profit already paid to the client outside a withdrawal request (e.g. a confirmed bank transfer). Client requests are handled under Withdrawals.',
    client: 'Profit Payout', needsSupport: true,
  },
  {
    id: 'authorized_charge', title: 'Authorized charge',
    hint: 'A charge against profit the client agreed to or that is set out in their terms.',
    client: 'Profit Debit', needsSupport: true,
  },
  {
    id: 'other', title: 'Other authorized debit',
    hint: 'Another documented, authorized debit of the profit balance.',
    client: 'Profit Debit', needsSupport: true,
  },
]

export type DebitResult = {
  duplicate: boolean
  transaction_id: string
  reference: string
  amount: number
  currency: string
  category: DebitCategory
  effective_at: string
  posted_at: string
  historical?: boolean
  pre_opening_exception?: boolean
  profit_balance_before: number
  profit_balance_after: number
}

const SOURCE_LABEL: Record<string, string> = {
  profit_distribution: 'Profit distribution', profit_allocation: 'Profit credit', profit_correction: 'Correction',
  loyalty_reward: 'Loyalty reward', promotional_credit: 'Promotional credit', reconciliation: 'Reconciliation', profit_adjustment: 'Manual credit',
}

export function ManualProfitDebitForm({ client, snapshot, snapshotError, onPosted }: {
  client: CreditClient
  snapshot: ProfitSnapshot | null
  snapshotError?: string
  onPosted?: (r: DebitResult) => void
}) {
  const [amount, setAmount] = useState('')
  const [d, setD] = useState<DateState>(blankDate)
  const [s, setS] = useState<SupportState>(blankSupport)
  const [category, setCategory] = useState<DebitCategory | ''>('')
  const [reverses, setReverses] = useState('')
  const [description, setDescription] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DebitResult | null>(null)
  // One key per debit: an unchanged form retried after a network error keeps
  // its key and is posted once; any change to the form makes a new debit.
  const key = useRef(newRequestKey())
  useEffect(() => { key.current = newRequestKey() }, [client.id, amount, d, s, category, reverses, description])

  const clear = () => {
    setAmount(''); setD(blankDate()); setS(blankSupport()); setCategory(''); setReverses(''); setDescription('')
    setError(''); setResult(null); setConfirming(false)
  }
  useEffect(clear, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = DEBIT_CATEGORIES.find(c => c.id === category)
  const credits = snapshot?.reversible_credits || []
  const rev = credits.find(x => x.reference === reverses)
  const n = Number(amount)
  const valid = AMOUNT.test(amount.trim()) && n > 0
  const available = snapshot ? Number(snapshot.available_for_debit) : null
  const over = valid && available !== null && n > available
  const needsSupport = !!cat?.needsSupport || dateRules(d, client.created_at).backdated

  const validate = () => {
    if (!snapshot) return 'The client’s profit balance has not loaded yet.'
    if (!valid) return 'Enter an amount greater than zero, with at most 2 decimal places.'
    if (over) return `The debit is more than the available profit balance (${usd(available)} available${Number(snapshot.pending_withdrawals) > 0 ? `, after ${usd(snapshot.pending_withdrawals)} requested for withdrawal` : ''}).`
    if (!category) return 'Choose what this debit is.'
    if (category === 'credit_reversal') {
      if (!rev) return 'Choose the credit this reverses.'
      if (n > Number(rev.remaining)) return `Only ${usd(rev.remaining)} of that credit is left to reverse.`
      if (d.date < rev.effective_at.slice(0, 10)) return 'A reversal cannot be dated before the entry it reverses.'
    }
    const dv = validateDate(d, client.created_at, s)
    if (dv) return dv
    if (cat?.needsSupport && !s.reference.trim() && !s.evidence) return 'This kind of debit needs a supporting reference or an evidence file.'
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
      const { debit } = await readJson<{ debit: DebitResult }>(await authFetch('/api/admin/profit-debit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current },
        body: JSON.stringify({
          user_id: client.id,
          amount: amount.trim(),
          category,
          reverses_reference: category === 'credit_reversal' ? reverses : null,
          description: description.trim(),
          ...dateBody(d, client.created_at),
          ...supportBody(s),
        }),
      }))
      setResult(debit)
      setConfirming(false)
      key.current = newRequestKey()
      onPosted?.(debit)
    } catch (e) {
      setConfirming(false)
      setError(errorText(e))
      if (e instanceof RequestError && e.status >= 400) key.current = newRequestKey()
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const c = DEBIT_CATEGORIES.find(x => x.id === result.category)
    return (
      <div data-mpd-result className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] p-4 sm:p-5">
        <p className="text-sm font-semibold text-rose-200">{result.duplicate ? 'This debit was already recorded' : 'Profit debit recorded'}</p>
        <p className="text-xs text-slate-400 mt-1">{result.duplicate ? 'The same request was received again; nothing new was posted.' : 'Posted once against the client’s profit balance. The client has been notified.'}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Reference" v={<span className="font-mono">{result.reference}</span>} />
          <Row k="Client" v={client.full_name || 'Unnamed client'} />
          <Row k="Amount" v={`−${usd(result.amount)} ${result.currency}`} />
          <Row k="Category" v={c?.title} />
          <Row k="Effective date" v={<>{fmtDate(result.effective_at)}{result.historical && <span className="block text-[11px] text-amber-300">Historical entry</span>}{result.pre_opening_exception && <span className="block text-[11px] text-amber-300">Pre-opening exception</span>}</>} />
          <Row k="Posted (server time)" v={fmtDateTime(result.posted_at)} />
          <Row k="Profit balance" v={<span className="tabular-nums">{usd(result.profit_balance_before)} → <span className="text-rose-200">{usd(result.profit_balance_after)}</span></span>} />
        </dl>
        <button type="button" onClick={clear} className="mt-5 w-full sm:w-auto text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl">Record another debit</button>
      </div>
    )
  }

  return (
    <div data-mpd-form>
      {error && <div role="alert" className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      {snapshotError && <p role="alert" className="mb-4 text-xs text-red-400">{snapshotError}</p>}
      <div className="space-y-4">
        <div>
          <label htmlFor="mpd-amount" className="block text-xs font-medium text-slate-400 mb-1.5">Amount (USD)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">$</span>
            <input id="mpd-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy}
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" aria-invalid={over || undefined}
              className={`input-field text-sm pl-7 tabular-nums ${over ? 'border-red-500/60' : ''}`} />
          </div>
          {snapshot && valid && (
            over
              ? <p className="text-xs text-red-400 mt-1.5" data-mpd-over>More than the {usd(available)} available to debit.</p>
              : <p className="text-xs text-slate-500 mt-1.5">Profit balance: <span className="text-white">{usd(snapshot.profit_balance)}</span> → <span className="text-rose-200 font-medium">{usd(Number(snapshot.profit_balance) - n)}</span></p>
          )}
        </div>

        <fieldset>
          <legend className="block text-xs font-medium text-slate-400 mb-1.5">What is this debit?</legend>
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Debit category">
            {DEBIT_CATEGORIES.map(c => {
              const on = category === c.id
              const off = c.id === 'credit_reversal' && !credits.length
              return (
                <button key={c.id} type="button" role="radio" aria-checked={on} disabled={busy || off} data-mpd-cat={c.id}
                  onClick={() => { setCategory(c.id); if (c.id !== 'credit_reversal') setReverses('') }}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-white/[0.08] hover:border-white/20'}`}>
                  <span className={`block text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{on ? '● ' : ''}{c.title}</span>
                  {(on || off) && <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{off ? 'No profit credit of this client is left to reverse.' : c.hint}</span>}
                  {on && <span className="block text-[10.5px] text-slate-500 mt-1">Client sees: <span className="text-slate-300">{c.client}</span>{c.needsSupport ? ' · reference or evidence required' : ''}</span>}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Investment returns: use <span className="text-slate-300">Edit profit / return</span> on the investment.</p>
        </fieldset>

        {category === 'credit_reversal' && (
          <div>
            <label htmlFor="mpd-rev" className="block text-xs font-medium text-slate-400 mb-1.5">Credit being reversed</label>
            <select id="mpd-rev" value={reverses} disabled={busy} onChange={e => setReverses(e.target.value)} className="input-field text-sm" data-mpd-reverses>
              <option value="">Choose a profit credit</option>
              {credits.map(x => (
                <option key={x.reference} value={x.reference}>{x.reference} · {SOURCE_LABEL[x.source || ''] || 'Credit'} · {usd(x.amount)} · {fmtDate(x.effective_at)} · {usd(x.remaining)} left</option>
              ))}
            </select>
          </div>
        )}

        <EffectiveDateFields prefix="mpd" value={d} onChange={setD} openedAt={client.created_at} busy={busy} kind="debit" />

        <div>
          <label htmlFor="mpd-desc" className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-500 font-normal">· shown to the client</span></label>
          <textarea id="mpd-desc" rows={2} maxLength={500} value={description} disabled={busy}
            onChange={e => setDescription(e.target.value)} placeholder="e.g. Reversal of duplicate distribution credited on 3 Sep" className="input-field resize-none text-sm" />
          <p className="text-[11px] text-slate-500 mt-1">Do not call it a withdrawal unless the client requested one.</p>
        </div>

        <SupportFields prefix="mpd" value={s} onChange={setS} busy={busy} required={needsSupport} onError={setError} />
      </div>

      <button type="button" onClick={review} disabled={busy || !snapshot || !amount || !category || !description.trim()} data-mpd-review
        className="w-full mt-5 py-3 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
        Review debit
      </button>

      {confirming && snapshot && (
        <ConfirmSheet id="mpd-confirm" title="Confirm manual profit debit" busy={busy} onCancel={() => setConfirming(false)} onConfirm={submit} confirmLabel="Confirm debit"
          intro="This posts one debit against the client’s profit balance and notifies the client. No investment, deposit or other balance changes. A posted debit is never deleted or edited; a mistake is corrected with a linked credit.">
          <dl className="mt-4 rounded-xl bg-white/[0.03] p-4 space-y-2 text-sm" data-mpd-confirm>
            <Row k="Client" v={<>{client.full_name || 'Unnamed client'}{client.email && <span className="block text-[11px] text-slate-500 break-all">{client.email}</span>}</>} />
            <Row k="Current profit balance" v={<span className="tabular-nums">{usd(snapshot.profit_balance)}</span>} />
            {Number(snapshot.pending_withdrawals) > 0 && <Row k="Requested withdrawals" v={<span className="tabular-nums">{usd(snapshot.pending_withdrawals)}</span>} />}
            <Row k="Proposed debit" v={<span className="tabular-nums text-rose-200">−{usd(n)} USD</span>} />
            <Row k="Resulting balance" v={<span className="tabular-nums font-semibold">{usd(Number(snapshot.profit_balance) - n)}</span>} />
            <Row k="Category" v={cat?.title} />
            {rev && <Row k="Reverses" v={<span className="font-mono text-xs">{rev.reference}</span>} />}
            <DateSummary d={d} openedAt={client.created_at} />
            <Row k="Reason" v={<span className="text-xs">{description.trim()}</span>} />
            <SupportSummary s={s} />
            <div className="pt-2 mt-1 border-t border-white/[0.06] space-y-1 text-xs">
              <Row k="Client sees" v={`${cat?.client} — ${description.trim()}`} />
              <Row k="Notification" v="Profit Balance Update" />
              <Row k="Posting time" v="Recorded by the server when you confirm" />
            </div>
          </dl>
        </ConfirmSheet>
      )}
    </div>
  )
}

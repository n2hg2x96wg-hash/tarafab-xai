'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'
import { usd, fmtDate, fmtDateTime } from '@/components/admin/ManualProfitCredit'

// Admin: Record Historical Investment. Documents a genuine investment a client
// made earlier that is missing from the investment history. Nothing here moves
// money: no deposit, debit or credit is created and no balance changes. The
// database function (admin_record_historical_investment) checks admin rights,
// validates every field, refuses duplicates, links only returns that were
// already credited, flags anything it cannot confirm for review, and writes
// the record and the audit entry in one transaction. A repeated request key
// returns the record already made.

export type HistClient = { id: string; full_name: string | null; email?: string | null; created_at: string }
type Status = 'active' | 'completed' | 'matured' | 'cancelled'
type Product = { id: string; code: string; status: string; current_version_id: string | null }
type Version = {
  id: string; product_id: string; version: number; name: string; published_at: string | null; currency: string
  min_amount: number; max_amount: number | null; return_type: string; return_rate_pct: number | null; return_amount: number | null
  duration_value: number | null; duration_unit: string | null; term_days: number | null
}
type Linkable = { id: string; reference: string | null; amount: number; type: string; source: string | null; effective_at: string; notes: string | null }
type Check = {
  blocking: { investment_id: string; reference: string | null; why: string }[]
  possible: { investment_id: string; reference: string | null; status: string; principal: number; fee_amount: number; same_product: boolean; historical: boolean; dated: string }[]
  matched_transaction: { id: string; type: string; amount: number; status: string; reference: string | null; effective_at: string } | null
  linkable_returns: Linkable[]
  configured_return: number | null
}
type Recorded = {
  duplicate: boolean; record_id: string; investment_id: string; reference: string; recorded_at: string; effective_at: string
  status?: Status; linked_return_total?: number; review_required: boolean; review_notes: string[]
}

export const STATUSES: { id: Status; title: string; hint: string }[] = [
  { id: 'active', title: 'Active', hint: 'Still running under its terms.' },
  { id: 'completed', title: 'Completed', hint: 'Ended and settled.' },
  { id: 'matured', title: 'Matured', hint: 'Reached the end of its term; settlement not recorded.' },
  { id: 'cancelled', title: 'Cancelled', hint: 'Stopped before running its term.' },
]
const statusTitle = (s: string) => STATUSES.find(x => x.id === s)?.title || s.replace(/_/g, ' ')

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/

function termsText(v: Version) {
  const ret = v.return_type === 'fixed_rate' ? `${Number(v.return_rate_pct ?? 0)}% return`
    : v.return_type === 'fixed_amount' ? `${usd(v.return_amount)} return` : 'No stated return'
  const dur = v.duration_value && v.duration_unit ? `${v.duration_value} ${v.duration_unit}` : v.term_days ? `${v.term_days} days` : 'Open term'
  return `${dur} · ${ret}`
}

// Products and their published versions (admin RLS: all of them, including
// products no longer offered). Terms are shown as stored, never edited here.
function useCatalog() {
  const [state, setState] = useState<{ products: Product[]; versions: Version[] } | 'error' | null>(null)
  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('investment_products').select('id, code, status, current_version_id').order('created_at'),
      (sb.from('investment_product_versions') as any)
        .select('id, product_id, version, name, published_at, currency, min_amount, max_amount, return_type, return_rate_pct, return_amount, duration_value, duration_unit, term_days')
        .not('published_at', 'is', null).order('version', { ascending: false }) as Promise<{ data: Version[] | null; error: unknown }>,
    ]).then(([p, v]) => {
      if (p.error || v.error) setState('error')
      else setState({ products: (p.data || []) as Product[], versions: v.data || [] })
    })
  }, [])
  return state
}

export function HistoricalInvestmentForm({ client, onRecorded }: { client: HistClient; onRecorded?: (r: Recorded) => void }) {
  const catalog = useCatalog()
  const today = ymd(new Date())
  const blank = { productId: '', versionId: '', amount: '', date: '', status: '' as Status | '', basis: '', completed: '', reference: '', evidenceRef: '', reason: '' }
  const [f, setF] = useState(blank)
  const [evidence, setEvidence] = useState<{ path: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [returns, setReturns] = useState<string[]>([])
  const [distinct, setDistinct] = useState(false)
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Recorded | null>(null)
  const set = (k: keyof typeof blank) => (v: string) => setF(x => ({ ...x, [k]: v }))
  // One key per historical record: an unchanged request retried after a lost
  // connection is recorded once; any change makes it a different request.
  const key = useRef(newRequestKey())
  useEffect(() => { key.current = newRequestKey() }, [client.id, f, evidence, returns, distinct])
  useEffect(() => { setF(blank); setEvidence(null); setReturns([]); setDistinct(false); setStep('form'); setCheck(null); setError(''); setResult(null) }, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const products = catalog && catalog !== 'error' ? catalog.products : []
  const versionsOf = (pid: string) => catalog && catalog !== 'error' ? catalog.versions.filter(v => v.product_id === pid) : []
  const versions = versionsOf(f.productId)
  const version = versions.find(v => v.id === f.versionId)
  const product = products.find(p => p.id === f.productId)
  const productName = (p: Product) => (versionsOf(p.id).find(v => v.id === p.current_version_id) || versionsOf(p.id)[0])?.name || p.code

  // The version in effect on the investment date: the latest one published on
  // or before it. The admin can choose another version if records show it.
  useEffect(() => {
    if (!f.productId) return
    const vs = versionsOf(f.productId)
    const onDate = f.date ? vs.find(v => v.published_at && v.published_at.slice(0, 10) <= f.date) : undefined
    const pick = onDate || vs[vs.length - 1]
    if (pick && pick.id !== f.versionId) setF(x => ({ ...x, versionId: pick.id }))
  }, [f.productId, f.date, catalog]) // eslint-disable-line react-hooks/exhaustive-deps

  const needsEnd = f.status === 'completed' || f.status === 'matured' || f.status === 'cancelled'
  const validate = () => {
    if (!f.productId || !f.versionId) return 'Choose the investment product and its terms version.'
    if (!AMOUNT.test(f.amount.trim()) || Number(f.amount) <= 0) return 'Enter the original amount, greater than zero, with at most 2 decimal places.'
    if (!f.date) return 'Choose the effective investment date.'
    if (f.date > today) return 'The effective investment date cannot be in the future.'
    if (!f.status) return 'Choose the investment’s actual status.'
    if (f.basis.trim().length < 5) return 'Explain how the status was established (at least 5 characters).'
    if (needsEnd && f.completed && (f.completed < f.date || f.completed > today)) return 'The end date must be between the investment date and today.'
    if (f.reason.trim().length < 10) return 'Explain why this record is being added (at least 10 characters).'
    return ''
  }

  const post = (body: Record<string, unknown>, idem?: string) => authFetch('/api/admin/historical-investments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) }, body: JSON.stringify(body),
  })
  const base = () => ({ user_id: client.id, product_version_id: f.versionId, amount: f.amount.trim(), effective_date: f.date, original_reference: f.reference.trim() || null, tz_offset_min: new Date().getTimezoneOffset() })

  const review = async () => {
    const v = validate()
    setError(v)
    if (v) return
    setBusy(true)
    try {
      const { check: c } = await readJson<{ check: Check }>(await post({ action: 'check', ...base() }))
      setCheck(c)
      setReturns(r => r.filter(id => c.linkable_returns.some(x => x.id === id)))
      setDistinct(false)
      setStep('review')
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { record } = await readJson<{ record: Recorded }>(await post({
        action: 'record', ...base(), status: f.status, status_basis: f.basis.trim(), completed_date: needsEnd && f.completed ? f.completed : null,
        evidence_reference: f.evidenceRef.trim() || null, evidence_path: evidence?.path || null, reason: f.reason.trim(),
        return_transaction_ids: returns, confirm_distinct: distinct,
      }, key.current))
      setResult(record)
      key.current = newRequestKey()
      onRecorded?.(record)
    } catch (e) {
      setError(errorText(e))
      if (e instanceof RequestError && e.status >= 400) key.current = newRequestKey()
    } finally { setBusy(false) }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('key', newRequestKey().replace(/[^A-Za-z0-9_-]/g, ''))
      const { path } = await readJson<{ path: string }>(await authFetch('/api/admin/historical-evidence', { method: 'POST', body: fd }, 60_000))
      setEvidence({ path, name: file.name })
    } catch (e) { setError(errorText(e)) } finally { setUploading(false) }
  }

  const reset = () => { setF(blank); setEvidence(null); setReturns([]); setDistinct(false); setStep('form'); setCheck(null); setError(''); setResult(null) }

  if (catalog === 'error') return <p role="alert" className="text-sm text-red-400">Investment products could not be loaded. Refresh to try again.</p>
  if (!catalog) return <p className="text-xs text-slate-500">Loading investment products…</p>

  if (result) return (
    <div data-hi-result className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
      <p className="text-sm font-semibold text-emerald-300">{result.duplicate ? 'This record was already added' : 'Historical investment recorded'}</p>
      <p className="text-xs text-slate-400 mt-1">{result.duplicate ? 'The same request was received again; nothing new was added.' : 'Added to the client’s investment history. No balance was changed and no transaction was created.'}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <Row k="Reference" v={<span className="font-mono">{result.reference}</span>} />
        <Row k="Client" v={client.full_name || 'Unnamed client'} />
        <Row k="Effective investment date" v={fmtDate(result.effective_at)} />
        <Row k="Recorded (server time)" v={fmtDateTime(result.recorded_at)} />
        {result.status && <Row k="Status" v={statusTitle(result.status)} />}
        {result.linked_return_total !== undefined && <Row k="Existing returns linked" v={usd(result.linked_return_total)} />}
      </dl>
      {result.review_required && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3" data-hi-flags>
          <p className="text-xs font-semibold text-amber-300">Flagged for review</p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-amber-200/90 list-disc pl-4">{result.review_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <button type="button" onClick={reset} className="mt-5 w-full sm:w-auto text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl">Record another</button>
    </div>
  )

  if (step === 'review' && check && version && product) {
    const blocked = check.blocking.length > 0
    const eligible = check.linkable_returns.filter(r => r.effective_at.slice(0, 10) >= f.date)
    const linkedTotal = eligible.filter(r => returns.includes(r.id)).reduce((s, r) => s + Number(r.amount), 0)
    return (
      <div data-hi-review>
        <h3 className="text-base font-bold text-white">Review historical investment</h3>
        <p className="text-xs text-slate-500 mt-1">Check every detail against your records. Nothing is saved until you confirm.</p>
        {blocked && (
          <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3.5" data-hi-blocking>
            <p className="text-sm font-semibold text-red-300">Already recorded</p>
            <ul className="mt-1 text-xs text-red-200/90 space-y-0.5">{check.blocking.map(b => <li key={b.investment_id + b.why}><span className="font-mono">{b.reference || b.investment_id.slice(0, 8)}</span> · {b.why}</li>)}</ul>
            <p className="mt-2 text-xs text-slate-400">Review the existing record in <Link href="/admin/investments" className="text-accent underline-offset-2 hover:underline">Investments</Link> instead of adding another.</p>
          </div>
        )}
        {!blocked && check.possible.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3.5" data-hi-possible>
            <p className="text-sm font-semibold text-amber-300">Similar investment{check.possible.length > 1 ? 's' : ''} already on record</p>
            <ul className="mt-1 text-xs text-amber-100/90 space-y-0.5">
              {check.possible.map(p => <li key={p.investment_id}><span className="font-mono">{p.reference || p.investment_id.slice(0, 8)}</span> · {usd(Number(p.principal) + Number(p.fee_amount))} · {fmtDate(p.dated)} · {statusTitle(p.status)}{p.same_product ? ' · same product' : ''}{p.historical ? ' · historical' : ''}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-200 cursor-pointer">
              <input type="checkbox" checked={distinct} onChange={e => setDistinct(e.target.checked)} className="mt-0.5" data-hi-distinct />
              <span>I reviewed {check.possible.length > 1 ? 'these records' : 'this record'}; this is a separate investment. (Recorded in the audit log.)</span>
            </label>
          </div>
        )}
        <dl className="mt-4 rounded-xl bg-white/[0.03] p-4 space-y-2 text-sm" data-hi-summary>
          <Row k="Client" v={<>{client.full_name || 'Unnamed client'}{client.email && <span className="block text-[11px] text-slate-500 break-all">{client.email}</span>}</>} />
          <Row k="Investment product" v={<>{version.name}<span className="block text-[11px] text-slate-500">Terms v{version.version} · {termsText(version)}{product.status !== 'active' ? ' · no longer offered' : ''}</span></>} />
          <Row k="Original amount" v={<span className="tabular-nums">{usd(Number(f.amount))} USD</span>} />
          <Row k="Effective investment date" v={longDate(f.date)} />
          <Row k="Record status" v={<>{statusTitle(f.status)}{needsEnd && f.completed && <span className="block text-[11px] text-slate-500">Ended {longDate(f.completed)}</span>}</>} />
          <Row k="Status basis" v={<span className="text-xs">{f.basis.trim()}</span>} />
          <Row k="Transaction reference" v={f.reference.trim() || <span className="text-amber-300 text-xs">None given</span>} />
          <Row k="Evidence" v={<span className="text-xs">{[f.evidenceRef.trim(), evidence?.name].filter(Boolean).join(' · ') || <span className="text-amber-300">None attached</span>}</span>} />
          <Row k="Reason" v={<span className="text-xs">{f.reason.trim()}</span>} />
          <div className="pt-2 mt-1 border-t border-white/[0.06] space-y-1 text-xs">
            <Row k="Balance impact" v="None: no deposit, debit or credit" />
            <Row k="Record entry time" v="Set by the server when you confirm" />
            {check.configured_return !== null && <Row k="Return per product terms" v={`${usd(check.configured_return)}, not credited`} />}
          </div>
        </dl>
        {check.matched_transaction && (
          <p className="mt-3 text-xs text-slate-400" data-hi-matched>The reference matches ledger entry <span className="font-mono text-slate-200">{check.matched_transaction.reference}</span> ({check.matched_transaction.type}, {usd(check.matched_transaction.amount)}, {fmtDate(check.matched_transaction.effective_at)}). It is noted on the record; no new transaction is created.</p>
        )}
        {!blocked && (
          <fieldset className="mt-4" data-hi-returns>
            <legend className="text-xs font-medium text-slate-400 mb-1.5">Returns already credited for this investment</legend>
            {eligible.length === 0 ? <p className="text-xs text-slate-500">No unlinked profit credits dated on or after the investment date. No return will be recorded or credited.</p> : (
              <>
                <ul className="space-y-1.5">
                  {eligible.map(r => (
                    <li key={r.id}>
                      <label className="flex items-start gap-2 text-xs cursor-pointer rounded-lg border border-white/[0.08] p-2.5 hover:border-white/20">
                        <input type="checkbox" checked={returns.includes(r.id)} onChange={e => setReturns(x => e.target.checked ? [...x, r.id] : x.filter(y => y !== r.id))} className="mt-0.5" data-hi-return={r.id} />
                        <span className="min-w-0 flex-1"><span className="text-slate-200 font-mono">{r.reference || r.id.slice(0, 8)}</span> · <span className="text-emerald-300 tabular-nums">+{usd(r.amount)}</span> · {fmtDate(r.effective_at)}{r.notes ? <span className="block text-slate-500 truncate">{r.notes}</span> : null}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-slate-500">Linking only connects a credit already in the ledger to this investment; nothing is credited again.{linkedTotal > 0 ? ` Linked: ${usd(linkedTotal)}.` : ''}</p>
              </>
            )}
          </fieldset>
        )}
        {error && <div role="alert" className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => { setStep('form'); setError('') }} disabled={busy} className="flex-1 text-sm text-slate-300 border border-white/[0.1] rounded-xl px-4 py-3">Back</button>
          <button type="button" onClick={submit} disabled={busy || blocked || (check.possible.length > 0 && !distinct)} data-hi-confirm
            className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Recording…' : 'Confirm and record'}</button>
        </div>
      </div>
    )
  }

  return (
    <div data-hi-form>
      {error && <div role="alert" className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      <div className="space-y-4">
        <div>
          <label htmlFor="hi-product" className="block text-xs font-medium text-slate-400 mb-1.5">Investment product</label>
          <select id="hi-product" value={f.productId} disabled={busy} onChange={e => setF(x => ({ ...x, productId: e.target.value, versionId: '' }))} className="input-field text-sm">
            <option value="">Choose a product</option>
            {products.filter(p => versionsOf(p.id).length > 0).map(p => <option key={p.id} value={p.id}>{productName(p)}{p.status !== 'active' ? ' (no longer offered)' : ''}</option>)}
          </select>
          {versions.length > 0 && (
            <div className="mt-2">
              <label htmlFor="hi-version" className="block text-[11px] text-slate-500 mb-1">Terms version in effect at the time</label>
              <select id="hi-version" value={f.versionId} disabled={busy} onChange={e => set('versionId')(e.target.value)} className="input-field text-sm">
                {versions.map(v => <option key={v.id} value={v.id}>v{v.version} · published {v.published_at ? fmtDate(v.published_at) : '—'} · {termsText(v)}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Chosen from the investment date. Product terms are shown as stored and are not changed.</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hi-amount" className="block text-xs font-medium text-slate-400 mb-1.5">Original amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">$</span>
              <input id="hi-amount" inputMode="decimal" autoComplete="off" value={f.amount} disabled={busy}
                onChange={e => set('amount')(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" className="input-field text-sm pl-7 tabular-nums" />
            </div>
          </div>
          <div>
            <label htmlFor="hi-date" className="block text-xs font-medium text-slate-400 mb-1.5">Effective investment date</label>
            <input id="hi-date" type="date" value={f.date} min="2000-01-01" max={today} disabled={busy} onChange={e => set('date')(e.target.value)} className="input-field text-sm" />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-slate-500">The date the investment genuinely occurred. The time this record is added is kept separately.</p>

        <fieldset>
          <legend className="block text-xs font-medium text-slate-400 mb-1.5">Actual status</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Actual status">
            {STATUSES.map(s => {
              const on = f.status === s.id
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} disabled={busy} data-hi-status={s.id} onClick={() => set('status')(s.id)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-white/[0.08] hover:border-white/20'}`}>
                  <span className={`block text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{on ? '● ' : ''}{s.title}</span>
                  <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{s.hint}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Choose what your records show. An old date does not make an investment completed.</p>
        </fieldset>
        {needsEnd && (
          <div>
            <label htmlFor="hi-ended" className="block text-xs font-medium text-slate-400 mb-1.5">Date it ended <span className="text-slate-500 font-normal">· if known</span></label>
            <input id="hi-ended" type="date" value={f.completed} min={f.date || '2000-01-01'} max={today} disabled={busy} onChange={e => set('completed')(e.target.value)} className="input-field text-sm" />
          </div>
        )}
        <div>
          <label htmlFor="hi-basis" className="block text-xs font-medium text-slate-400 mb-1.5">How was this status established?</label>
          <input id="hi-basis" value={f.basis} maxLength={500} disabled={busy} onChange={e => set('basis')(e.target.value)} placeholder="e.g. Closing statement dated 30 May 2026" className="input-field text-sm" />
        </div>

        <div>
          <label htmlFor="hi-ref" className="block text-xs font-medium text-slate-400 mb-1.5">Original transaction reference</label>
          <input id="hi-ref" value={f.reference} maxLength={120} disabled={busy} onChange={e => set('reference')(e.target.value)} placeholder="e.g. bank transfer or wallet transaction ID" className="input-field text-sm font-mono" />
          <p className="text-[11px] text-slate-500 mt-1">Checked against existing investments and the ledger before saving.</p>
        </div>

        <div>
          <label htmlFor="hi-evref" className="block text-xs font-medium text-slate-400 mb-1.5">Supporting evidence</label>
          <input id="hi-evref" value={f.evidenceRef} maxLength={500} disabled={busy} onChange={e => set('evidenceRef')(e.target.value)} placeholder="e.g. Bank statement Feb 2026, page 2" className="input-field text-sm" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {evidence ? (
              <>
                <span className="text-[12px] text-slate-300 truncate max-w-[220px]" data-hi-evidence>📎 {evidence.name}</span>
                <button type="button" onClick={() => setEvidence(null)} className="text-[12px] text-slate-400 underline underline-offset-2">Remove</button>
              </>
            ) : (
              <label className={`text-[12px] text-slate-300 border border-white/[0.12] rounded-lg px-3 py-1.5 cursor-pointer hover:bg-white/[0.05] ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading ? 'Uploading…' : 'Attach file (PDF or image, 5 MB)'}
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" data-hi-file onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Stored privately; only administrators can open it.</p>
        </div>

        <div>
          <label htmlFor="hi-reason" className="block text-xs font-medium text-slate-400 mb-1.5">Reason for the historical entry</label>
          <textarea id="hi-reason" rows={3} maxLength={1000} value={f.reason} disabled={busy} onChange={e => set('reason')(e.target.value)}
            placeholder="e.g. Verified historical investment missing from application records." className="input-field resize-none text-sm" />
        </div>
      </div>

      <button type="button" onClick={review} disabled={busy || uploading} data-hi-review
        className="w-full mt-6 py-3.5 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
        {busy ? 'Checking records…' : 'Check and review'}
      </button>
      <p className="mt-2 text-[11px] text-slate-500 text-center">Recording never moves money. To reconcile balances, use <Link href="/admin/reconciliation" className="underline underline-offset-2">Reconciliation</Link>.</p>
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

type HistRow = {
  id: string; investment_id: string; user_id: string; admin_id: string; product_version_id: string; amount: number; currency: string
  effective_date: string; recorded_at: string; status_recorded: string; status_basis: string; completed_date: string | null
  original_reference: string | null; evidence_reference: string | null; evidence_path: string | null; reason: string
  linked_return_transaction_ids: string[]; configured_return: number | null; distinct_confirmed: boolean
  review_required: boolean; review_notes: string[]; voided_at: string | null; void_reason: string | null
  client_investments: { reference: string | null; status: string; profit_amount: number } | null
  investment_product_versions: { name: string; version: number } | null
}
type Correction = { id: string; record_id: string; admin_id: string; action: string; reason: string; created_at: string }

// Recorded historical investments with their correction history (admin only).
export function HistoricalInvestmentHistory({ clientId, refreshKey = 0 }: { clientId?: string; refreshKey?: number }) {
  const [rows, setRows] = useState<HistRow[] | null>(null)
  const [corr, setCorr] = useState<Correction[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    const sb = createClient()
    let q = (sb.from('historical_investment_records') as any)
      .select('id, investment_id, user_id, admin_id, product_version_id, amount, currency, effective_date, recorded_at, status_recorded, status_basis, completed_date, original_reference, evidence_reference, evidence_path, reason, linked_return_transaction_ids, configured_return, distinct_confirmed, review_required, review_notes, voided_at, void_reason, client_investments(reference, status, profit_amount), investment_product_versions(name, version)')
      .order('recorded_at', { ascending: false }).limit(50)
    if (clientId) q = q.eq('user_id', clientId)
    ;(q as Promise<{ data: HistRow[] | null; error: unknown }>).then(async ({ data, error: e }) => {
      if (!live) return
      if (e) { setError('Historical records could not be loaded.'); return }
      setError(''); setRows(data || [])
      const ids = (data || []).map(r => r.id)
      const [c, ps] = await Promise.all([
        ids.length ? (sb.from('historical_investment_corrections') as any).select('id, record_id, admin_id, action, reason, created_at').in('record_id', ids).order('created_at') as Promise<{ data: Correction[] | null }> : Promise.resolve({ data: [] as Correction[] }),
        (async () => {
          const people = Array.from(new Set((data || []).flatMap(r => [r.user_id, r.admin_id])))
          return people.length ? ((await (sb.from('profiles') as any).select('id, full_name').in('id', people)).data || []) as { id: string; full_name: string | null }[] : []
        })(),
      ])
      if (!live) return
      setCorr(c.data || [])
      setNames(new Map(ps.map(p => [p.id, p.full_name || 'Unnamed'])))
    })
    return () => { live = false }
  }, [clientId, refreshKey, reload])

  if (error) return <p role="alert" className="text-xs text-red-400">{error}</p>
  if (!rows) return <p className="text-xs text-slate-500">Loading…</p>
  if (!rows.length) return <p className="text-xs text-slate-500" data-hi-history-empty>No historical investments recorded{clientId ? ' for this client' : ''} yet.</p>

  return (
    <ul className="divide-y divide-white/[0.06]" data-hi-history>
      {rows.map(r => <HistoryItem key={r.id} r={r} corrections={corr.filter(c => c.record_id === r.id)} names={names} showClient={!clientId} onChanged={() => setReload(n => n + 1)} />)}
    </ul>
  )
}

function HistoryItem({ r, corrections, names, showClient, onChanged }: { r: HistRow; corrections: Correction[]; names: Map<string, string>; showClient: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<'' | 'status' | 'link_returns' | 'resolve_review' | 'void'>('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('')
  const [ended, setEnded] = useState('')
  const [linkable, setLinkable] = useState<Linkable[] | null>(null)
  const [pick, setPick] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const current = r.client_investments?.status || r.status_recorded
  const voided = !!r.voided_at
  // Same transitions the investment workflow allows.
  const next = useMemo(() => ({ active: ['completed', 'matured'], matured: ['completed', 'closed'], completed: ['closed'] } as Record<string, string[]>)[current] || [], [current])

  useEffect(() => {
    if (open !== 'link_returns' || linkable) return
    authFetch('/api/admin/historical-investments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', user_id: r.user_id, product_version_id: r.product_version_id, amount: String(r.amount), effective_date: r.effective_date }) })
      .then(res => readJson<{ check: Check }>(res))
      .then(({ check }) => setLinkable(check.linkable_returns.filter(x => x.effective_at.slice(0, 10) >= r.effective_date)))
      .catch(e => setErr(errorText(e)))
  }, [open, linkable, r])

  const go = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await readJson(await authFetch('/api/admin/historical-investments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correct', record_id: r.id, correction: open, reason: reason.trim(), status: status || null, completed_date: ended || null, return_transaction_ids: pick, tz_offset_min: new Date().getTimezoneOffset() }),
      }))
      setOpen(''); setReason(''); setStatus(''); setEnded(''); setPick([]); setLinkable(null)
      onChanged()
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  const viewEvidence = async () => {
    try {
      const { url } = await readJson<{ url: string }>(await authFetch(`/api/admin/historical-evidence?path=${encodeURIComponent(r.evidence_path!)}`))
      window.open(url, '_blank', 'noopener')
    } catch (e) { setErr(errorText(e)) }
  }

  const ready = reason.trim().length >= 5 && (open !== 'status' || !!status) && (open !== 'link_returns' || pick.length > 0)

  return (
    <li className={`py-3 text-sm ${voided ? 'opacity-60' : ''}`} data-hi-row data-hi-voided={voided ? 'true' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium">{r.investment_product_versions?.name || 'Investment'} <span className="text-slate-500 font-normal text-xs">v{r.investment_product_versions?.version}</span></p>
          <p className="text-[11px] text-slate-500 font-mono">{r.client_investments?.reference || '—'}{r.original_reference ? ` · orig. ${r.original_reference}` : ''}</p>
          {showClient && <Link href={`/admin/clients/${r.user_id}`} className="text-[12px] text-accent hover:text-accent-hover">{names.get(r.user_id) || 'Client'}</Link>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-semibold tabular-nums">{usd(r.amount)} <span className="text-[10px] text-slate-500 font-normal">{r.currency}</span></p>
          <p className="text-[11px] text-slate-400">{voided ? 'Voided' : statusTitle(current)}</p>
        </div>
      </div>
      <dl className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div className="flex gap-1.5"><dt className="text-slate-500">Invested</dt><dd className="text-slate-200">{longDate(r.effective_date)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">Recorded</dt><dd className="text-slate-300">{fmtDateTime(r.recorded_at)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">By</dt><dd className="text-slate-300">{names.get(r.admin_id) || 'Admin'}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">Returns linked</dt><dd className="text-slate-300 tabular-nums">{usd(r.client_investments?.profit_amount ?? 0)}</dd></div>
        {r.completed_date && <div className="flex gap-1.5"><dt className="text-slate-500">Ended</dt><dd className="text-slate-300">{longDate(r.completed_date)}</dd></div>}
      </dl>
      <p className="text-[11px] text-slate-400 mt-1 break-words">{r.reason}</p>
      <p className="text-[11px] text-slate-500 break-words">Status basis: {r.status_basis}{r.evidence_reference ? ` · Evidence: ${r.evidence_reference}` : ''}</p>
      {r.evidence_path && <button type="button" onClick={viewEvidence} className="mt-1 text-[11px] text-accent underline underline-offset-2">View evidence file</button>}
      {r.distinct_confirmed && <p className="text-[11px] text-slate-500">Confirmed separate from a similar record.</p>}
      {r.review_required && !voided && (
        <ul className="mt-1.5 text-[11px] text-amber-300/90 list-disc pl-4" data-hi-row-flags>{r.review_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      {voided && <p className="text-[11px] text-red-300/80 mt-1">Voided {fmtDateTime(r.voided_at!)}: {r.void_reason}</p>}
      {corrections.length > 0 && (
        <ul className="mt-1.5 text-[11px] text-slate-500 space-y-0.5" data-hi-corrections>
          {corrections.map(c => <li key={c.id}>{fmtDateTime(c.created_at)} · {names.get(c.admin_id) || 'Admin'} · {c.action.replace(/_/g, ' ')} · {c.reason}</li>)}
        </ul>
      )}
      {!voided && open === '' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {next.length > 0 && <button type="button" onClick={() => setOpen('status')} className="text-[11px] text-slate-300 border border-white/[0.12] rounded-lg px-2.5 py-1">Change status</button>}
          {current !== 'cancelled' && <button type="button" onClick={() => setOpen('link_returns')} className="text-[11px] text-slate-300 border border-white/[0.12] rounded-lg px-2.5 py-1">Link existing return</button>}
          {r.review_required && <button type="button" onClick={() => setOpen('resolve_review')} className="text-[11px] text-slate-300 border border-white/[0.12] rounded-lg px-2.5 py-1">Mark reviewed</button>}
          <button type="button" onClick={() => setOpen('void')} className="text-[11px] text-red-300 border border-red-500/30 rounded-lg px-2.5 py-1" data-hi-void>Void record</button>
        </div>
      )}
      {open && (
        <div className="mt-2 rounded-xl border border-white/[0.08] p-3 space-y-2" data-hi-correct={open}>
          <p className="text-xs font-semibold text-white">{open === 'status' ? 'Change status' : open === 'link_returns' ? 'Link an existing return' : open === 'resolve_review' ? 'Mark review complete' : 'Void this record'}</p>
          {open === 'void' && <p className="text-[11px] text-slate-400">The record stays in the audit history. The investment is removed from the client’s history and totals, and any returns it linked can be linked again. No balance changes.</p>}
          {open === 'status' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={status} onChange={e => setStatus(e.target.value)} className="input-field text-sm" aria-label="New status">
                <option value="">New status</option>
                {next.map(s => <option key={s} value={s}>{statusTitle(s)}</option>)}
              </select>
              <input type="date" value={ended} min={r.effective_date} max={ymd(new Date())} onChange={e => setEnded(e.target.value)} className="input-field text-sm" aria-label="Date it ended" />
            </div>
          )}
          {open === 'link_returns' && (
            !linkable ? <p className="text-[11px] text-slate-500">Loading credits…</p>
              : linkable.length === 0 ? <p className="text-[11px] text-slate-500">No unlinked profit credits dated on or after the investment date.</p>
              : <ul className="space-y-1">{linkable.map(x => (
                <li key={x.id}><label className="flex items-center gap-2 text-[11px] text-slate-300">
                  <input type="checkbox" checked={pick.includes(x.id)} onChange={e => setPick(p => e.target.checked ? [...p, x.id] : p.filter(y => y !== x.id))} />
                  <span className="font-mono">{x.reference || x.id.slice(0, 8)}</span> · +{usd(x.amount)} · {fmtDate(x.effective_at)}
                </label></li>))}</ul>
          )}
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Reason (required, kept in the audit log)" className="input-field text-sm" aria-label="Reason" />
          {err && <p role="alert" className="text-[11px] text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(''); setErr('') }} disabled={busy} className="flex-1 text-xs text-slate-300 border border-white/[0.1] rounded-lg px-3 py-2">Cancel</button>
            <button type="button" onClick={go} disabled={busy || !ready} className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 disabled:opacity-50 ${open === 'void' ? 'text-white bg-red-600' : 'text-accent-ink bg-accent'}`}>{busy ? 'Saving…' : 'Confirm'}</button>
          </div>
        </div>
      )}
      {err && !open && <p role="alert" className="text-[11px] text-red-400 mt-1">{err}</p>}
    </li>
  )
}

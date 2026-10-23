'use client'

import { useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'

// Fields shared by the Manual Profit Credit and Debit forms: the effective
// date with its historical and pre-opening rules, and the supporting
// reference, evidence file and internal note. The database functions enforce
// the same rules; these give the admin the requirement before submitting.

const pad = (n: number) => String(n).padStart(2, '0')
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// A calendar date (YYYY-MM-DD) in words, without time-zone shifts.
export const longDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
export const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/

export type DateState = { date: string; backdate: string; exceptionAck: boolean; basis: string }
export const blankDate = (): DateState => ({ date: localToday(), backdate: '', exceptionAck: false, basis: '' })
export type SupportState = { reference: string; evidence: { path: string; name: string } | null; note: string }
export const blankSupport = (): SupportState => ({ reference: '', evidence: null, note: '' })

// What the effective date requires, from the client's opening date.
export function dateRules(d: DateState, openedAt: string) {
  const today = localToday()
  const opened = localDay(openedAt)
  return { today, opened, backdated: !!d.date && d.date < today, preOpening: !!d.date && d.date < opened }
}

export function validateDate(d: DateState, openedAt: string, support: SupportState): string {
  const r = dateRules(d, openedAt)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Choose an effective date.'
  if (d.date > r.today) return 'The effective date cannot be in the future.'
  if (d.date < '2000-01-01') return 'Check the effective date.'
  if (r.backdated && d.backdate.trim().length < 10) return 'Explain why this entry applies to an earlier date (at least 10 characters).'
  if (r.backdated && !support.reference.trim() && !support.evidence) return 'A historical entry needs a supporting reference or an evidence file.'
  if (r.preOpening && (!d.exceptionAck || d.basis.trim().length < 20)) {
    return `The effective date is before this client’s account was opened (${longDate(r.opened)}). Confirm the pre-opening exception and explain the accounting basis (at least 20 characters), or record the entry against the correct account.`
  }
  return ''
}

export function dateBody(d: DateState, openedAt: string) {
  const r = dateRules(d, openedAt)
  return {
    effective_date: d.date,
    backdate_reason: r.backdated ? d.backdate.trim() : null,
    exception_ack: r.preOpening ? d.exceptionAck : false,
    exception_basis: r.preOpening ? d.basis.trim() : null,
    tz_offset_min: new Date().getTimezoneOffset(),
  }
}

export function supportBody(s: SupportState) {
  return { external_reference: s.reference.trim() || null, evidence_path: s.evidence?.path || null, internal_note: s.note.trim() || null }
}

export function EffectiveDateFields({ prefix, value, onChange, openedAt, busy, kind }: {
  prefix: string; value: DateState; onChange: (v: DateState) => void; openedAt: string; busy: boolean; kind: 'credit' | 'debit'
}) {
  const r = dateRules(value, openedAt)
  const set = <K extends keyof DateState>(k: K) => (v: DateState[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${prefix}-date`} className="block text-xs font-medium text-slate-400 mb-1.5">Effective date</label>
        <input id={`${prefix}-date`} type="date" value={value.date} min="2000-01-01" max={r.today} disabled={busy}
          onChange={e => set('date')(e.target.value)} className="input-field text-sm" data-mp-date />
        <p className="text-[11px] text-slate-500 mt-1">Shown to the client. The posting time is recorded separately.</p>
        {r.backdated && <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-2 py-0.5 text-[11px] font-semibold text-amber-300" data-mp-historical>Historical entry · dated before today</p>}
      </div>

      {r.backdated && (
        <div>
          <label htmlFor={`${prefix}-backdate`} className="block text-xs font-medium text-amber-300 mb-1.5">Why does this {kind} apply to an earlier date?</label>
          <textarea id={`${prefix}-backdate`} rows={2} maxLength={500} value={value.backdate} disabled={busy}
            onChange={e => set('backdate')(e.target.value)} placeholder="e.g. Approved on this date, recorded late after month-end review" className="input-field resize-none text-sm" />
          <p className="text-[11px] text-slate-500 mt-1">At least 10 characters, plus a reference or evidence file. Audit log only.</p>
        </div>
      )}

      {r.preOpening && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5" data-mp-preopening>
          <p className="text-[13px] font-semibold text-amber-200">Before account opening</p>
          <p className="text-[11px] leading-relaxed text-slate-300 mt-1">This client’s account was opened on <span className="text-white">{longDate(r.opened)}</span>. The opening date is not changed. Record this entry only as a documented exception with an accounting basis — or, if it belongs to another account, record it against that account instead.</p>
          <label className="mt-3 flex items-start gap-2.5 text-[12px] text-slate-200 cursor-pointer">
            <input type="checkbox" checked={value.exceptionAck} disabled={busy} onChange={e => set('exceptionAck')(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" data-mp-exception-ack />
            <span>I confirm this {kind} belongs to this client and is authorized for a date before the account was opened.</span>
          </label>
          <label htmlFor={`${prefix}-basis`} className="block text-xs font-medium text-amber-300 mt-3 mb-1.5">Accounting basis</label>
          <textarea id={`${prefix}-basis`} rows={2} maxLength={1000} value={value.basis} disabled={busy}
            onChange={e => set('basis')(e.target.value)} placeholder="e.g. Funds held under the client’s prior agreement ref. A-118 before onboarding" className="input-field resize-none text-sm" />
          <p className="text-[11px] text-slate-500 mt-1">At least 20 characters. Kept in the audit log; not shown to the client.</p>
        </div>
      )}
    </div>
  )
}

export function SupportFields({ prefix, value, onChange, busy, required, onError }: {
  prefix: string; value: SupportState; onChange: (v: SupportState) => void; busy: boolean; required: boolean; onError: (m: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const set = <K extends keyof SupportState>(k: K) => (v: SupportState[K]) => onChange({ ...value, [k]: v })
  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true); onError('')
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('key', newRequestKey().replace(/[^A-Za-z0-9_-]/g, ''))
      const { path } = await readJson<{ path: string }>(await authFetch('/api/admin/historical-evidence', { method: 'POST', body: fd }, 60_000))
      onChange({ ...value, evidence: { path, name: file.name } })
    } catch (e) { onError(errorText(e)) } finally { setUploading(false) }
  }
  const filled = !!(value.reference.trim() || value.evidence || value.note.trim())
  const [opened, setOpened] = useState(false)
  const open = required || filled || opened
  return (
    <details open={open} onToggle={e => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setOpened(o) }}
      className="rounded-xl border border-white/[0.08] px-3.5 py-2.5" data-mp-more>
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-300 min-h-8 flex items-center justify-between gap-2">
        <span>Additional details <span className="text-slate-500 font-normal">· {required ? 'reference or evidence required' : 'reference, evidence, internal note'}</span></span>
        <span className="text-slate-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </summary>
    <div className="space-y-3 pt-2.5">
      <div>
        <label htmlFor={`${prefix}-ref`} className="block text-xs font-medium text-slate-400 mb-1.5">Transaction or accounting reference <span className="text-slate-500 font-normal">· {required ? 'required (or attach evidence)' : 'optional'}</span></label>
        <input id={`${prefix}-ref`} value={value.reference} maxLength={120} disabled={busy} autoComplete="off"
          onChange={e => set('reference')(e.target.value)} placeholder="e.g. JRNL-2026-0412 or board approval ref." className="input-field text-sm" data-mp-ref />
        <p className="text-[11px] text-slate-500 mt-1">Each reference can be used once per client. Admin only.</p>
      </div>
      <div>
        <span className="block text-xs font-medium text-slate-400 mb-1.5">Supporting evidence</span>
        <div className="flex flex-wrap items-center gap-2">
          {value.evidence ? (
            <>
              <span className="text-[12px] text-slate-300 truncate max-w-[220px]" data-mp-evidence>📎 {value.evidence.name}</span>
              <button type="button" disabled={busy} onClick={() => set('evidence')(null)} className="text-[12px] text-slate-400 underline underline-offset-2">Remove</button>
            </>
          ) : (
            <label className={`text-[12px] text-slate-300 border border-white/[0.12] rounded-lg px-3 py-1.5 cursor-pointer hover:bg-white/[0.05] ${uploading || busy ? 'opacity-60 pointer-events-none' : ''}`}>
              {uploading ? 'Uploading…' : 'Attach file (PDF or image, 5 MB)'}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" data-mp-file onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Stored privately; only administrators can open it.</p>
      </div>
      <div>
        <label htmlFor={`${prefix}-note`} className="block text-xs font-medium text-slate-400 mb-1.5">Internal note <span className="text-slate-500 font-normal">· optional, admin only</span></label>
        <textarea id={`${prefix}-note`} rows={2} maxLength={1000} value={value.note} disabled={busy}
          onChange={e => set('note')(e.target.value)} placeholder="Anything other administrators should know" className="input-field resize-none text-sm" />
      </div>
    </div>
    </details>
  )
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400 shrink-0">{k}</dt>
      <dd className="text-white text-right min-w-0 break-words">{v}</dd>
    </div>
  )
}

// Confirmation dialog shell shared by both forms (bottom sheet on a phone).
export function ConfirmSheet({ id, title, intro, busy, onCancel, onConfirm, confirmLabel, children }: {
  id: string; title: string; intro: string; busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onCancel()} />
      <div className="relative z-10 glass w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <h3 id={`${id}-title`} className="text-base font-bold text-white">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{intro}</p>
        {children}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 text-sm text-slate-300 border border-white/[0.1] rounded-xl px-4 py-3">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} data-mp-confirm-btn className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-3 disabled:opacity-60">{busy ? 'Posting…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// The historical / pre-opening lines of a confirmation summary.
export function DateSummary({ d, openedAt }: { d: DateState; openedAt: string }) {
  const r = dateRules(d, openedAt)
  return (
    <>
      <Row k="Effective date" v={<>{longDate(d.date)}{r.backdated && <span className="block text-[11px] text-amber-300">Historical entry</span>}{r.preOpening && <span className="block text-[11px] text-amber-300">Before account opening ({longDate(r.opened)}) · exception</span>}</>} />
      {r.backdated && <Row k="Why earlier" v={<span className="text-xs">{d.backdate.trim()}</span>} />}
      {r.preOpening && <Row k="Accounting basis" v={<span className="text-xs">{d.basis.trim()}</span>} />}
    </>
  )
}

export function SupportSummary({ s }: { s: SupportState }) {
  return (
    <>
      <Row k="Reference" v={s.reference.trim() || <span className="text-slate-500">None</span>} />
      <Row k="Evidence" v={s.evidence ? <span className="text-xs">{s.evidence.name}</span> : <span className="text-slate-500">None attached</span>} />
      {s.note.trim() && <Row k="Internal note" v={<span className="text-xs">{s.note.trim()}</span>} />}
    </>
  )
}

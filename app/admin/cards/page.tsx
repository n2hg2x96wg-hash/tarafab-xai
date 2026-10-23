'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson } from '@/lib/authFetch'

type Settings = { fee: number | null; currency: string; open: boolean; terms: string | null; issuer_name: string | null; updated_at: string }
type Design = { id: string; name: string; base_color: string; enabled: boolean }
type App = {
  id: string; reference: string; user_id: string; client_name: string; client_email: string | null; status: string; design_name: string; color: string
  nickname: string | null; fee: number; currency: string; payment_reference: string; issuer_name: string | null; issuer_reference: string | null; admin_note: string | null; created_at: string; updated_at: string
}
type Data = { settings: Settings; designs: Design[]; counts: Record<string, number>; applications: App[] }

const LABEL: Record<string, string> = { paid_submitted: 'Paid · Submitted', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', issued: 'Issued', cancelled: 'Cancelled' }
const NEXT: Record<string, string[]> = { paid_submitted: ['under_review', 'approved', 'rejected'], under_review: ['approved', 'rejected'], approved: ['issued', 'rejected'] }
const usd = (n: number) => `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Admin → Cards. Fee, terms and issuing partner; design availability; the
// application queue. Status changes never move money (refunds, if the
// published policy grants one, go through Balance actions on the client page).
export default function AdminCardsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({ fee: '', open: false, terms: '', issuer_name: '', reason: '' })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await readJson<Data>(await authFetch(`/api/admin/cards${filter ? `?status=${filter}` : ''}`))
      setData(r); setError('')
      return r
    } catch (e) { setError(errorText(e)); return null }
  }, [filter])
  useEffect(() => {
    load().then(r => { if (r) setForm(f => ({ ...f, fee: r.settings.fee == null ? '' : String(r.settings.fee), open: r.settings.open, terms: r.settings.terms || '', issuer_name: r.settings.issuer_name || '' })) })
  }, [load])

  const post = async (body: Record<string, unknown>, tag: string, ok: string) => {
    setBusy(tag); setMsg(null)
    try {
      await readJson(await authFetch('/api/admin/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      setMsg({ ok: true, text: ok }); await load(); return true
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); return false } finally { setBusy('') }
  }

  const saveSettings = async () => {
    if (await post({ action: 'settings', fee: form.fee.trim() === '' ? null : Number(form.fee), open: form.open, terms: form.terms, issuer_name: form.issuer_name, reason: form.reason }, 'settings', 'Card settings saved.'))
      setForm(f => ({ ...f, reason: '' }))
  }

  return (
    <AdminLayout title="Cards" subtitle="Card designs, the application fee and card applications">
      <div className="space-y-5 max-w-5xl" data-admin-cards>
        {error && !data && <AdminLoadError message={error} onRetry={() => load()} />}
        {msg && <p role="status" className={`rounded-xl border px-4 py-3 text-[14px] ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/[.07] text-emerald-300' : 'border-red-500/30 bg-red-500/[.07] text-red-300'}`} data-admin-cards-msg>{msg.text}</p>}
        {data && (
          <>
            {/* Settings */}
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-labelledby="cs-h">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 id="cs-h" className="text-[16px] font-semibold text-white">Applications &amp; fee</h2>
                <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${data.settings.open ? 'text-emerald-300 border-emerald-500/30' : 'text-slate-300 border-white/15'}`} data-cards-open={data.settings.open}>{data.settings.open ? 'Open' : 'Closed'}</span>
              </div>
              <p className="text-[13px] text-slate-400 mb-4">Open applications only when a real card issuing partner is in place. Clients pay this fee from their available balance.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block"><span className="text-[13px] text-slate-300">Application fee (USD)</span>
                  <input inputMode="decimal" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Not set" className="input-field mt-1 w-full text-[16px]" data-cards-fee /></label>
                <label className="block"><span className="text-[13px] text-slate-300">Card issuing partner</span>
                  <input value={form.issuer_name} onChange={e => setForm({ ...form, issuer_name: e.target.value })} maxLength={120} placeholder="Required to open applications" className="input-field mt-1 w-full text-[16px]" data-cards-issuer /></label>
              </div>
              <label className="block mt-3"><span className="text-[13px] text-slate-300">Application terms, incl. cancellation &amp; refund policy (shown to clients before paying)</span>
                <textarea value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} rows={4} maxLength={4000} className="input-field mt-1 w-full text-[15px]" data-cards-terms /></label>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[14px] text-slate-200"><input type="checkbox" checked={form.open} onChange={e => setForm({ ...form, open: e.target.checked })} className="w-5 h-5" data-cards-open-toggle />Accept paid applications</label>
              </div>
              <div className="mt-3 flex flex-col sm:flex-row gap-3">
                <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} maxLength={500} placeholder="Reason for this change (audit log)" className="input-field flex-1 text-[16px]" data-cards-reason />
                <button type="button" onClick={saveSettings} disabled={busy === 'settings' || !form.reason.trim()} className="btn btn-solid min-h-11" data-cards-save>{busy === 'settings' ? 'Saving…' : 'Save settings'}</button>
              </div>
            </section>

            {/* Designs */}
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-labelledby="cd-h">
              <h2 id="cd-h" className="text-[16px] font-semibold text-white mb-1">Card designs</h2>
              <p className="text-[13px] text-slate-400 mb-3">A disabled design is hidden from every client. Past applications keep it.</p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {data.designs.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 py-2.5">
                    <span className="flex items-center gap-2.5 min-w-0"><span className="w-5 h-5 rounded-full border border-white/20 shrink-0" style={{ background: d.base_color }} /><span className="text-[14px] text-white truncate">{d.name}</span></span>
                    <button type="button" disabled={!!busy} onClick={() => post({ action: 'design', id: d.id, enabled: !d.enabled }, `d-${d.id}`, `${d.name} ${d.enabled ? 'disabled' : 'enabled'}.`)}
                      className={`btn btn-sm min-h-10 ${d.enabled ? 'btn-outline' : 'btn-solid'}`} data-design-toggle={d.id} data-enabled={d.enabled}>{busy === `d-${d.id}` ? '…' : d.enabled ? 'Enabled · Disable' : 'Disabled · Enable'}</button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Applications */}
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-labelledby="ca-h">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 id="ca-h" className="text-[16px] font-semibold text-white">Applications</h2>
                <select value={filter} onChange={e => setFilter(e.target.value)} className="input-field text-[15px] min-h-10 w-auto" aria-label="Filter by status" data-cards-filter>
                  <option value="">All ({Object.values(data.counts).reduce((a, b) => a + b, 0)})</option>
                  {Object.keys(LABEL).map(s => <option key={s} value={s}>{LABEL[s]} ({data.counts[s] || 0})</option>)}
                </select>
              </div>
              {data.applications.length === 0 ? <p className="text-[14px] text-slate-400" data-cards-empty>No card applications.</p> : (
                <ul className="space-y-3">{data.applications.map(a => <AppRow key={a.id} a={a} busy={busy} onSet={(status, note, ref) => post({ action: 'status', id: a.id, status, note, issuer_reference: ref }, `a-${a.id}`, `${a.reference}: ${LABEL[status]}.`)} />)}</ul>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

function AppRow({ a, busy, onSet }: { a: App; busy: string; onSet: (status: string, note: string, ref: string) => Promise<boolean> }) {
  const [next, setNext] = useState('')
  const [note, setNote] = useState('')
  const [ref, setRef] = useState('')
  const options = NEXT[a.status] || []
  return (
    <li className="rounded-xl border border-white/[0.08] p-3.5" data-card-app={a.reference}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/admin/clients/${a.user_id}`} className="text-[15px] font-medium text-white hover:text-accent">{a.client_name || 'Client'}</Link>
          {a.client_email && <p className="text-[12.5px] text-slate-400 break-all">{a.client_email}</p>}
        </div>
        <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[12.5px] text-slate-200" data-app-status={a.status}>{LABEL[a.status] || a.status}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12.5px]">
        <div><dt className="text-slate-500">Application</dt><dd className="text-white font-mono break-all">{a.reference}</dd></div>
        <div><dt className="text-slate-500">Paid</dt><dd className="text-white tabular-nums">{usd(a.fee)} {a.currency}</dd></div>
        <div><dt className="text-slate-500">Payment ref.</dt><dd className="text-white font-mono break-all">{a.payment_reference}</dd></div>
        <div><dt className="text-slate-500">Applied</dt><dd className="text-white">{when(a.created_at)}</dd></div>
        <div><dt className="text-slate-500">Design</dt><dd className="text-white flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: a.color }} />{a.design_name}</dd></div>
        {a.nickname && <div><dt className="text-slate-500">Nickname</dt><dd className="text-white break-all">{a.nickname}</dd></div>}
        {a.issuer_reference && <div><dt className="text-slate-500">Issuer ref.</dt><dd className="text-white break-all">{a.issuer_name} · {a.issuer_reference}</dd></div>}
        {a.admin_note && <div className="col-span-2"><dt className="text-slate-500">Note</dt><dd className="text-white">{a.admin_note}</dd></div>}
      </dl>
      {options.length > 0 && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <select value={next} onChange={e => setNext(e.target.value)} className="input-field text-[15px] min-h-10 sm:w-48" aria-label="New status" data-app-next>
            <option value="">Change status…</option>
            {options.map(o => <option key={o} value={o}>{LABEL[o]}</option>)}
          </select>
          {next === 'issued' && <input value={ref} onChange={e => setRef(e.target.value)} maxLength={80} placeholder="Issuer's card reference" className="input-field flex-1 text-[16px]" data-app-ref />}
          {next && <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={next === 'rejected' ? 'Reason (shown in records)' : 'Note (optional)'} className="input-field flex-1 text-[16px]" data-app-note />}
          {next && <button type="button" disabled={!!busy || (next === 'rejected' && note.trim().length < 3) || (next === 'issued' && ref.trim().length < 4)}
            onClick={async () => { if (await onSet(next, note, ref)) { setNext(''); setNote(''); setRef('') } }} className="btn btn-solid btn-sm min-h-10" data-app-apply>{busy === `a-${a.id}` ? '…' : 'Update'}</button>}
        </div>
      )}
    </li>
  )
}

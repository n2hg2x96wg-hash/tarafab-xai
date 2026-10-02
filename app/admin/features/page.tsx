'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal, Field } from '@/components/AdminModal'

type Flag = { key: string; state: string; label: string; note: string; updated_at: string }
const STATES: [string, string][] = [
  ['enabled', 'Enabled — available to clients'], ['premium', 'Premium — available with Tarafab Premium'],
  ['coming_soon', 'Coming soon — shown as coming soon, not usable'], ['unavailable', 'Unavailable — hidden (provider or data source down)'],
  ['disabled', 'Disabled — hidden'], ['admin_only', 'Admin only — hidden from clients'],
]
const TONE: Record<string, string> = { enabled: 'text-emerald-400', premium: 'text-amber-300', coming_soon: 'text-sky-300', unavailable: 'text-slate-400', disabled: 'text-slate-500', admin_only: 'text-violet-300' }

// Feature states: the server checks these before acting (API routes) and the
// client app only reflects them. Underlying code and data are never removed.
export default function AdminFeaturesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Flag[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [edit, setEdit] = useState<null | { key: string; label: string; state: string; note: string; reason: string }>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await (supabase.from('feature_flags') as any).select('*').order('key')
    if (error) { setError('Feature states could not be loaded.'); return }
    setRows(Array.isArray(data) ? data : []); setError('')
  }, [supabase])
  useEffect(() => { load() }, [load, reload])
  const save = async () => {
    if (!edit) return
    setBusy(true); setFormErr('')
    const { error } = await (supabase.rpc as any).call(supabase, 'admin_set_feature', { p_key: edit.key, p_state: edit.state, p_note: edit.note, p_reason: edit.reason })
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    setEdit(null); load()
  }
  return (
    <AdminLayout title="Feature states" subtitle="What clients can use; enforced by the server">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <div className="glass rounded-2xl border border-white/[0.08] p-4 overflow-x-auto">
        {!rows ? <p className="text-xs text-slate-500">Loading…</p> : (
          <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Feature</th><th className="pr-3">State</th><th className="pr-3">Note</th><th className="pr-3">Updated</th><th /></tr></thead>
            <tbody>{rows.map(f => (
              <tr key={f.key} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3">{f.label || f.key}<div className="text-slate-500 font-mono">{f.key}</div></td>
                <td className={`pr-3 font-semibold ${TONE[f.state] || ''}`}>{f.state.replace('_', ' ')}</td>
                <td className="pr-3">{f.note || '—'}</td>
                <td className="pr-3">{new Date(f.updated_at).toLocaleString()}</td>
                <td><button onClick={() => { setFormErr(''); setEdit({ key: f.key, label: f.label, state: f.state, note: f.note, reason: '' }) }} className="text-violet-300 hover:text-violet-200">Change</button></td>
              </tr>))}</tbody></table>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Hiding a feature never deletes its code or data. A transfer that a client already sent can always be recorded and credited, whatever the state.</p>
      </div>
      {edit && (
        <AdminModal title={`Feature: ${edit.label || edit.key}`} busy={busy} err={formErr} onClose={() => setEdit(null)} onSave={save}>
          <Field label="State"><select className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={edit.state} onChange={e => setEdit({ ...edit, state: e.target.value })}>{STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Note (internal)"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /></Field>
          <Field label="Reason (audit log)"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
    </AdminLayout>
  )
}

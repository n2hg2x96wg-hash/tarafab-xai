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

// Client Dashboard Feature Controls: simple ON/OFF for each client module.
// ON = 'enabled' (visible), OFF = 'disabled' (hidden; its API refuses use).
// Data is never touched, so switching back ON restores everything at once.
const CONTROLS: { key: string; label: string; hint: string }[] = [
  { key: 'markets', label: 'Markets', hint: 'Markets, market activity, price history' },
  { key: 'charts', label: 'Charts', hint: 'Price charts and sparklines' },
  { key: 'watchlist', label: 'Watchlist', hint: 'Watchlist tab and stars' },
  { key: 'portfolio', label: 'Portfolio', hint: 'Portfolio and performance' },
  { key: 'investments', label: 'Investment Center', hint: 'Investment products and active investments' },
  { key: 'wallet', label: 'Wallet', hint: 'Wallet section' },
  { key: 'deposits', label: 'Deposits', hint: 'Deposit form and history' },
  { key: 'withdrawals', label: 'Withdrawals', hint: 'Withdrawal form and history' },
  { key: 'automations', label: 'Automations', hint: 'Automation Center' },
  { key: 'trading_status', label: 'Trading / automation indicators', hint: 'Trading status card on the overview' },
  { key: 'premium', label: 'Premium plans', hint: 'Premium section and checkout' },
  { key: 'activity', label: 'Activity', hint: 'Transactions list' },
  { key: 'verification', label: 'Verification', hint: 'KYC section' },
  { key: 'announcements', label: 'Announcements', hint: 'Notifications and team announcements' },
  { key: 'support', label: 'Support / contact', hint: 'Support section' },
  { key: 'wallet_transfer', label: 'Transfer to Tarafab', hint: 'External wallet transfers' },
]
const isOn = (state: string | undefined) => !state || !['disabled', 'unavailable', 'admin_only'].includes(state)

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
  const [tog, setTog] = useState<null | { key: string; label: string; on: boolean; reason: string }>(null)
  const saveToggle = async () => {
    if (!tog) return
    setBusy(true); setFormErr('')
    const cur = rows?.find(f => f.key === tog.key)
    const { error } = await (supabase.rpc as any).call(supabase, 'admin_set_feature', { p_key: tog.key, p_state: tog.on ? 'enabled' : 'disabled', p_note: cur?.note || '', p_reason: tog.reason })
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    setTog(null); load()
  }
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
      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5" aria-labelledby="fc-title">
        <h2 id="fc-title" className="text-sm font-semibold text-white">Client Dashboard Feature Controls</h2>
        <p className="mt-1 mb-3 text-xs text-slate-400">ON = visible to clients. OFF = hidden from clients and refused by the server. Switching OFF never deletes data; switching back ON restores it immediately.</p>
        {!rows ? <p className="text-xs text-slate-500">Loading…</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {CONTROLS.filter(c => rows.some(f => f.key === c.key)).map(c => {
              const st = rows.find(f => f.key === c.key)?.state
              const on = isOn(st)
              return (
                <li key={c.key} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{c.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{c.hint}{st && st !== 'enabled' && st !== 'disabled' ? ` · ${st.replace('_', ' ')}` : ''}</p>
                  </div>
                  <button role="switch" aria-checked={on} aria-label={`${c.label}: ${on ? 'ON' : 'OFF'}`} onClick={() => { setFormErr(''); setTog({ key: c.key, label: c.label, on: !on, reason: '' }) }}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500/80' : 'bg-slate-600/60'}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className={`w-8 text-[11px] font-semibold ${on ? 'text-emerald-400' : 'text-slate-500'}`}>{on ? 'ON' : 'OFF'}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {tog && (
        <AdminModal title={`${tog.on ? 'Show' : 'Hide'} ${tog.label} ${tog.on ? 'to' : 'from'} clients`} saveLabel={tog.on ? 'Turn ON' : 'Turn OFF'} busy={busy} err={formErr} onClose={() => setTog(null)} onSave={saveToggle}>
          <p className="text-xs text-slate-400">{tog.on ? 'Clients will see and can use this feature again, with all its existing data.' : 'Clients will no longer see this feature, and the server will refuse its actions. No data is deleted.'}</p>
          <Field label="Reason (audit log)"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={tog.reason} onChange={e => setTog({ ...tog, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
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

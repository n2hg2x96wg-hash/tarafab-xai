'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal, Field } from '@/components/AdminModal'

type Flag = { key: string; state: string; label: string; note: string; updated_at: string; updated_by?: string | null }
type Change = { id: number; actor_id: string | null; entity_id: string; created_at: string; details: { before?: { state?: string }; after?: { state?: string }; reason?: string } | null }
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  { key: 'live_chat', label: 'Live chat', hint: 'Smartsupp chat bubble for clients and visitors' },
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
    // Change history from the append-only audit log (admin-only by RLS).
    const h = await (supabase.from('audit_logs') as any).select('id, actor_id, entity_id, created_at, details').eq('action', 'feature_state_changed').order('created_at', { ascending: false }).limit(20)
    if (!h.error) setHistory(Array.isArray(h.data) ? h.data : [])
    const ids = Array.from(new Set([...(data || []).map((f: Flag) => f.updated_by), ...((h.data || []) as Change[]).map(c => c.actor_id)].filter(Boolean))) as string[]
    if (ids.length) { const p = await (supabase.from('profiles') as any).select('id, email, full_name').in('id', ids); if (!p.error) setWho(Object.fromEntries((p.data || []).map((x: { id: string; email?: string; full_name?: string }) => [x.id, x.full_name || x.email || 'Admin']))) }
  }, [supabase])
  const [history, setHistory] = useState<Change[] | null>(null)
  const [who, setWho] = useState<Record<string, string>>({})
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
    <AdminLayout title="Feature Control Center" subtitle="What clients can see and use — enforced by the server and database">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5" aria-labelledby="fc-title">
        <h2 id="fc-title" className="text-sm font-semibold text-white">Client Dashboard Feature Controls</h2>
        <p className="mt-1 mb-3 text-xs text-slate-400">ON = visible to clients. OFF = hidden from clients and refused by the server. Switching OFF never deletes data; switching back ON restores it immediately.</p>
        {!rows ? <p className="text-xs text-slate-500">Loading…</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {CONTROLS.filter(c => rows.some(f => f.key === c.key)).map(c => {
              const row = rows.find(f => f.key === c.key)
              const st = row?.state
              const on = isOn(st)
              return (
                <li key={c.key} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white flex items-center gap-2">{c.label}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${on ? 'text-emerald-400' : 'text-red-300/80'}`} data-flag-status={c.key}>
                        <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.8)]' : 'bg-red-400/70'}`} aria-hidden="true" />{on ? 'Enabled' : 'Disabled'}</span></p>
                    <p className="text-[11px] text-slate-500 truncate">{c.hint}{st && st !== 'enabled' && st !== 'disabled' ? ` · ${st.replace('_', ' ')}` : ''}</p>
                    <p className="text-[10.5px] text-slate-600 truncate">Access: {on ? (st === 'premium' ? 'Premium clients' : 'All clients') : 'No clients'}{row ? ` · Changed ${fmtWhen(row.updated_at)}${row.updated_by ? ` by ${who[row.updated_by] || 'an admin'}` : ''}` : ''}</p>
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
      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5" aria-labelledby="fc-hist">
        <h2 id="fc-hist" className="text-sm font-semibold text-white">Change history</h2>
        <p className="mt-1 mb-3 text-xs text-slate-400">Every switch is recorded in the audit log with who changed it, when, and why. Clients never see this.</p>
        {!history ? <p className="text-xs text-slate-500">Loading…</p> : !history.length ? <p className="text-xs text-slate-500">No changes recorded yet.</p> : (
          <ol className="divide-y divide-white/[0.06]" data-flag-history>
            {history.map(h => {
              const label = CONTROLS.find(c => c.key === h.entity_id)?.label || h.entity_id
              const b = h.details?.before?.state, a = h.details?.after?.state
              return (
                <li key={h.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-white font-medium">{label}</span>
                  <span className="text-slate-400"><span className={TONE[b || ''] || ''}>{isOn(b) ? 'Enabled' : 'Disabled'}</span> → <span className={TONE[a || ''] || ''}>{isOn(a) ? 'Enabled' : 'Disabled'}</span>{b && a && (b !== 'enabled' && b !== 'disabled' || a !== 'enabled' && a !== 'disabled') ? ` (${b} → ${a})` : ''}</span>
                  <span className="text-slate-500">{h.actor_id ? who[h.actor_id] || 'Admin' : 'Admin'} · {fmtWhen(h.created_at)}</span>
                  {h.details?.reason && <span className="text-slate-500 w-full truncate">“{h.details.reason}”</span>}
                </li>
              )
            })}
          </ol>
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

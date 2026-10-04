'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Admin: how the automation engine is presented to clients and visitors.
// Saved through admin_set_automation_presentation (admin-only, audited).
// These settings change names, copy and visibility only — the status, the
// monitored assets and every activity event always come from the engine's
// own records and cannot be set here.
type P = { panel_visible: boolean; preview_visible: boolean; display_name: string; asset_labels: string; description: string; animation: 'off' | 'subtle' | 'standard'; operating_mode: 'active' | 'paused' | 'maintenance' }

export function EnginePresentationForm() {
  const supabase = createClient()
  const [p, setP] = useState<P | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/automation/status', { cache: 'no-store' }).then(r => r.json()).then(j => j?.status?.presentation && setP(j.status.presentation)).catch(() => setMsg('Could not load the current settings.'))
  }, [])
  const save = async () => {
    if (!p) return
    setBusy(true); setMsg('')
    const { error } = await (supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => Promise<{ error: { message: string } | null }>)('admin_set_automation_presentation', { p })
    setBusy(false); setMsg(error ? `Not saved: ${error.message}` : 'Saved. Clients see the change within a minute.')
  }
  const field = 'mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white'
  return (
    <section className="glass rounded-2xl border border-white/[0.08] p-4 sm:p-5 mb-5" aria-labelledby="eng-pres">
      <h2 id="eng-pres" className="text-sm font-semibold text-white">Engine presentation</h2>
      <p className="mt-1 text-xs text-slate-400">Controls the automation panel on the client Investments page and the landing preview. Monitored assets and activity always come from the engine itself. Every save is recorded in the audit log with the previous and new values.</p>
      {!p ? <p className="mt-3 text-xs text-slate-500">{msg || 'Loading…'}</p> : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300 sm:col-span-2">Engine operating mode
            <select className={field} value={p.operating_mode || 'active'} onChange={e => setP({ ...p, operating_mode: e.target.value as P['operating_mode'] })}>
              <option value="active">Active — rules are evaluated every minute</option>
              <option value="paused">Paused — quotes still recorded, no rules evaluated</option>
              <option value="maintenance">Maintenance — quotes still recorded, no rules evaluated</option>
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">The engine itself reads this each run, so the status clients see matches what it actually does. Which assets can be automated is set per asset in Assets &amp; market data.</span>
          </label>
          <label className="text-xs text-slate-300">Display name<input className={field} maxLength={60} value={p.display_name} onChange={e => setP({ ...p, display_name: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Asset labels (shown when no live list is available)<input className={field} maxLength={80} value={p.asset_labels} onChange={e => setP({ ...p, asset_labels: e.target.value })} /></label>
          <label className="text-xs text-slate-300 sm:col-span-2">Explanatory copy<textarea className={field} rows={2} maxLength={280} value={p.description} onChange={e => setP({ ...p, description: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Animation<select className={field} value={p.animation} onChange={e => setP({ ...p, animation: e.target.value as P['animation'] })}><option value="standard">Standard</option><option value="subtle">Subtle</option><option value="off">Off</option></select></label>
          <div className="flex flex-col justify-end gap-2 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={p.panel_visible} onChange={e => setP({ ...p, panel_visible: e.target.checked })} /> Show panel to clients</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={p.preview_visible} onChange={e => setP({ ...p, preview_visible: e.target.checked })} /> Show landing preview</label>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            {msg && <span className="text-xs text-slate-400" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}

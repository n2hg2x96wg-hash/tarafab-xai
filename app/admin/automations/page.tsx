'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { EnginePresentationForm } from '@/components/admin/EnginePresentationForm'

type Row = { id: string; user_id: string; full_name: string | null; asset_id: string; kind: string; target: number; status: string; name: string; last_evaluated_at: string | null; last_price: number | null; last_data_state: string | null; triggered_at: string | null; trigger_price: number | null; last_error: string | null; created_at: string }
type Overview = { counts: Record<string, number>; engine: { last_run_at: string | null; last_ok_at: string | null; last_error: string | null; last_evaluated: number | null; last_triggered: number | null } | null; triggered_24h: number; failed_24h: number }
const KIND: Record<string, string> = { price_above: 'price ≥', price_below: 'price ≤', pct_up: '24h ≥ +', pct_down: '24h ≤ −', move_abs: '24h move ≥' }
const TONE: Record<string, string> = { active: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10', paused: 'text-slate-400 border-white/[0.08]', triggered: 'text-sky-300 border-sky-500/20 bg-sky-500/10', failed: 'text-red-400 border-red-500/20 bg-red-500/10', deleted: 'text-slate-600 border-white/[0.05]' }
const ago = (s: string | null) => { if (!s) return 'never'; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

// Automation Center (admin): processing health and the list of rules. Shows
// the client name and rule only — no financial or wallet information.
export default function AdminAutomationsPage() {
  const supabase = createClient()
  const [ov, setOv] = useState<Overview | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('')
  const [asset, setAsset] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [reload, setReload] = useState(0)
  const PAGE = 50

  const load = useCallback(async (before?: string) => {
    const [o, l] = await Promise.all([
      before ? Promise.resolve({ data: undefined, error: null }) : (supabase.rpc as any)('admin_automation_overview'),
      (supabase.rpc as any)('admin_list_automations', { p_status: status || null, p_asset: asset.trim().toUpperCase() || null, p_before: before || null, p_limit: PAGE + 1 }),
    ]) as [{ data?: Overview; error: unknown }, { data: Row[] | null; error: unknown }]
    if (o.error || l.error) { setError('Automation data could not be loaded.'); setLoading(false); return }
    if (o.data) setOv(o.data)
    const page = (l.data || []).slice(0, PAGE); setHasMore((l.data || []).length > PAGE)
    setRows(prev => (before ? [...prev, ...page.filter(r => !prev.some(x => x.id === r.id))] : page)); setError(''); setLoading(false)
  }, [supabase, status, asset])
  useEffect(() => { setLoading(true); load() }, [load, reload])
  useEffect(() => { const i = setInterval(() => load(), 30_000); return () => clearInterval(i) }, [load])

  const engineAge = ov?.engine?.last_ok_at ? (Date.now() - new Date(ov.engine.last_ok_at).getTime()) / 60000 : null
  const health = engineAge == null ? ['No successful run yet', 'text-amber-300'] : engineAge <= 3 ? ['Healthy', 'text-emerald-400'] : ['Delayed — last run ' + ago(ov!.engine!.last_ok_at), 'text-red-400']
  const c = (s: string) => ov?.counts?.[s] ?? 0

  return (
    <AdminLayout title="Automation Center" subtitle="Client market alerts and the engine that evaluates them">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <EnginePresentationForm />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[['Active', c('active')], ['Paused', c('paused')], ['Triggered', c('triggered')], ['Failed', c('failed')]].map(([k, v]) => <div key={k as string} className="glass rounded-xl border border-white/[0.08] p-3"><p className="text-[11px] text-slate-500">{k}</p><p className="text-xl font-semibold text-white tabular-nums">{ov ? v : '—'}</p></div>)}
      </div>
      <div className="glass rounded-2xl border border-white/[0.08] p-4 mb-5 grid gap-3 sm:grid-cols-4 text-xs">
        <div><p className="text-slate-500">Processing</p><p className={`font-semibold ${health[1]}`}>{ov ? health[0] : '—'}</p></div>
        <div><p className="text-slate-500">Last successful evaluation</p><p className="text-white">{ago(ov?.engine?.last_ok_at ?? null)}</p></div>
        <div><p className="text-slate-500">Last run: evaluated / triggered</p><p className="text-white tabular-nums">{ov?.engine ? `${ov.engine.last_evaluated ?? 0} / ${ov.engine.last_triggered ?? 0}` : '—'}</p></div>
        <div><p className="text-slate-500">Last 24 h: triggered / failed</p><p className="text-white tabular-nums">{ov ? `${ov.triggered_24h} / ${ov.failed_24h}` : '—'}</p></div>
        {ov?.engine?.last_error && <p className="sm:col-span-4 text-red-400 break-words">System error: {ov.engine.last_error}</p>}
        <p className="sm:col-span-4 text-slate-500">Market-data health per asset: <Link href="/admin/assets" className="text-violet-300 hover:text-violet-200">Assets &amp; Market Data →</Link></p>
      </div>

      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_auto] border-b border-white/[0.06]">
          <input value={asset} onChange={e => setAsset(e.target.value)} placeholder="Filter by asset symbol (e.g. BTC)…" className="input-field text-xs py-2" aria-label="Asset symbol" />
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-field text-xs py-2" aria-label="Status"><option value="">All statuses</option>{['active', 'paused', 'triggered', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        {loading ? <div className="p-10 text-center"><div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" /></div>
          : rows.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No automations match these filters.</div>
          : <ul className="divide-y divide-white/[0.05]">{rows.map(r => (
            <li key={r.id} className="px-4 py-3 grid gap-1 sm:grid-cols-[1.2fr_1.4fr_.8fr_1.4fr] sm:items-center sm:gap-4 text-sm">
              <span className="min-w-0"><Link href={`/admin/clients/${r.user_id}`} className="block text-white truncate hover:underline">{r.full_name || 'Unnamed client'}</Link><span className="block text-[11px] text-slate-500">created {ago(r.created_at)}</span></span>
              <span className="text-xs text-slate-300">{r.asset_id} {KIND[r.kind]} {r.target}{r.kind.startsWith('pct') || r.kind === 'move_abs' ? '%' : ''}</span>
              <span><span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${TONE[r.status]}`}>{r.status}</span></span>
              <span className="text-[11px] text-slate-500 truncate" title={r.last_error || ''}>{r.status === 'triggered' ? `triggered ${ago(r.triggered_at)} at $${r.trigger_price}` : r.last_error ? r.last_error : `checked ${ago(r.last_evaluated_at)}${r.last_data_state ? ` · data ${r.last_data_state}` : ''}`}</span>
            </li>))}</ul>}
        {hasMore && <div className="p-4 text-center border-t border-white/[0.06]"><button onClick={() => load(rows[rows.length - 1]?.created_at)} className="text-xs text-violet-300 hover:text-violet-200">Load more</button></div>}
      </div>
    </AdminLayout>
  )
}

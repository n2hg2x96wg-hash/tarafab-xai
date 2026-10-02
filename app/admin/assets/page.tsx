'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'

type Asset = { id: string; name: string; category: string; provider: string; provider_symbol: string; note: string; enabled: boolean; visible: boolean; chart_enabled: boolean; automation_enabled: boolean; sort_order: number }
type Quote = { asset_id: string; price: number | null; change_pct: number | null; source_time: string | null; fetched_at: string; state: string; error: string | null }
const STATE_STYLE: Record<string, string> = {
  live: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10', delayed: 'text-sky-300 border-sky-500/20 bg-sky-500/10',
  stale: 'text-amber-300 border-amber-500/20 bg-amber-500/10', unavailable: 'text-slate-400 border-white/[0.08] bg-white/[0.03]', error: 'text-red-400 border-red-500/20 bg-red-500/10',
}
const ago = (s: string | null) => { if (!s) return '—'; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

// Asset Management + Market Data Health. Presentation changes here (name,
// category, visibility, enabled, order, charts, automations) are saved through
// an audited admin function; disabling an asset never deletes its history.
export default function AdminAssetsPage() {
  const supabase = createClient()
  const [assets, setAssets] = useState<Asset[]>([])
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'health' | 'manage'>('health')
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [state, setState] = useState('')
  const [edit, setEdit] = useState<Asset | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [reload, setReload] = useState(0)

  const load = useCallback(async () => {
    const [a, q] = await Promise.all([
      (supabase.from('market_assets') as any).select('*').order('category').order('sort_order').order('id'),
      (supabase.from('market_quotes') as any).select('asset_id, price, change_pct, source_time, fetched_at, state, error'),
    ]) as [{ data: Asset[] | null; error: unknown }, { data: Quote[] | null; error: unknown }]
    if (a.error || q.error) { setError('Market data could not be loaded.'); setLoading(false); return }
    setAssets(a.data || []); setQuotes(new Map((q.data || []).map(r => [r.asset_id, r]))); setError(''); setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load, reload])
  useEffect(() => { const i = setInterval(() => load(), 30_000); return () => clearInterval(i) }, [load])

  const stateOf = (a: Asset) => {
    const q = quotes.get(a.id)
    if (!q) return 'unavailable'
    if ((q.state === 'live' || q.state === 'delayed') && Date.now() - new Date(q.fetched_at).getTime() > 10 * 60_000) return 'stale'
    return q.state
  }
  const rows = assets.filter(a => (!cat || a.category === cat) && (!state || stateOf(a) === state) && (!search || a.id.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase())))
  const counts = ['live', 'delayed', 'stale', 'unavailable', 'error'].map(s => [s, assets.filter(a => a.enabled && stateOf(a) === s).length] as const)

  const save = async () => {
    if (!edit || busy) return
    setBusy(true); setFormError('')
    const { error: e } = await (supabase.rpc as any)('admin_update_asset', { p_id: edit.id, p_name: edit.name, p_category: edit.category, p_enabled: edit.enabled, p_visible: edit.visible, p_chart: edit.chart_enabled, p_automation: edit.automation_enabled, p_sort: Number(edit.sort_order), p_note: edit.note }) as { error: { message: string } | null }
    setBusy(false)
    if (e) { setFormError(/^(Enter|Choose|Asset|Not authorized)/.test(e.message) ? e.message : 'The asset could not be saved. Please try again.'); return }
    setEdit(null); setReload(n => n + 1)
  }

  const toggle = (k: 'enabled' | 'visible' | 'chart_enabled' | 'automation_enabled', label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-300 py-1.5">
      <span>{label}</span><input type="checkbox" checked={edit![k]} onChange={e => setEdit(a => (a ? { ...a, [k]: e.target.checked } : a))} className="w-4 h-4 accent-violet-500" />
    </label>
  )

  return (
    <AdminLayout title="Assets & Market Data" subtitle="Manage supported assets and monitor the data behind them">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {counts.map(([s, n]) => (
          <button key={s} onClick={() => { setTab('health'); setState(st => (st === s ? '' : s)) }} className={`glass rounded-xl border p-3 text-left ${state === s ? 'border-violet-500/40' : 'border-white/[0.08]'}`}>
            <p className="text-[11px] text-slate-500 capitalize">{s}</p><p className="text-xl font-semibold text-white tabular-nums">{n}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {(['health', 'manage'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tab === t ? 'bg-violet-600/20 text-violet-300 border-violet-500/30' : 'text-slate-500 border-white/[0.06] hover:text-white'}`}>{t === 'health' ? 'Market data health' : 'Asset management'}</button>)}
      </div>

      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] border-b border-white/[0.06]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by symbol or name…" className="input-field text-xs py-2" aria-label="Search assets" />
          <select value={cat} onChange={e => setCat(e.target.value)} className="input-field text-xs py-2" aria-label="Category"><option value="">All categories</option>{['crypto', 'stock', 'index', 'etf'].map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select value={state} onChange={e => setState(e.target.value)} className="input-field text-xs py-2" aria-label="Data state"><option value="">All data states</option>{['live', 'delayed', 'stale', 'unavailable', 'error'].map(c => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        {loading ? <div className="p-10 text-center"><div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" /></div>
          : rows.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No assets match these filters.</div>
          : (
            <ul className="divide-y divide-white/[0.05]">
              {rows.map(a => {
                const q = quotes.get(a.id); const st = stateOf(a)
                return (
                  <li key={a.id} className="px-4 py-3 grid gap-1 sm:grid-cols-[1.4fr_.8fr_1fr_1fr_1.4fr_auto] sm:items-center sm:gap-4 text-sm">
                    <span className="min-w-0"><span className="block text-white truncate">{a.name} <span className="text-slate-500 text-xs">{a.id}</span></span><span className="block text-[11px] text-slate-500">{a.category} · {a.provider}{a.enabled ? '' : ' · disabled'}{a.visible ? '' : ' · hidden'}</span></span>
                    <span><span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${STATE_STYLE[st]}`}>{st}</span></span>
                    <span className="text-xs text-slate-300 tabular-nums">{q?.price != null ? `$${Number(q.price).toLocaleString('en-US', { maximumFractionDigits: 6 })}` : '—'}</span>
                    <span className="text-xs text-slate-500">updated {ago(q?.fetched_at || null)}</span>
                    <span className="text-[11px] text-slate-500 truncate" title={q?.error || ''}>{q?.error || (tab === 'manage' ? `order ${a.sort_order}` : 'ok')}</span>
                    <button onClick={() => { setEdit({ ...a }); setFormError('') }} className="text-xs text-violet-300 hover:text-violet-200 justify-self-start sm:justify-self-end">Edit</button>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
      <p className="mt-3 text-[11px] text-slate-600">Quotes are refreshed by the automation engine about once a minute. States: live (fresh), delayed (fresh but behind the market), stale (not refreshed for 10+ minutes), unavailable (no data from the source), error (the source request failed). Equity and index data needs the FINNHUB_API_KEY secret on the automation-engine function.</p>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="asset-edit">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setEdit(null)} />
          <div className="relative z-10 glass w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <h3 id="asset-edit" className="text-base font-bold text-white">{edit.id} · {edit.provider}</h3>
            <p className="text-[11px] text-slate-500 mb-4">Symbol and data source are fixed; the settings below change what clients see. Saved with an audit entry.</p>
            <label className="block text-xs text-slate-400 mb-1">Name</label><input value={edit.name} maxLength={80} onChange={e => setEdit({ ...edit, name: e.target.value })} className="input-field w-full text-sm mb-3" />
            <label className="block text-xs text-slate-400 mb-1">Category</label>
            <select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} className="input-field w-full text-sm mb-3">{['crypto', 'stock', 'index', 'etf'].map(c => <option key={c} value={c}>{c}</option>)}</select>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div><label className="block text-xs text-slate-400 mb-1">Display order</label><input type="number" value={edit.sort_order} onChange={e => setEdit({ ...edit, sort_order: Number(e.target.value) })} className="input-field w-full text-sm" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Note</label><input value={edit.note} maxLength={120} onChange={e => setEdit({ ...edit, note: e.target.value })} className="input-field w-full text-sm" /></div>
            </div>
            <div className="divide-y divide-white/[0.05] border-y border-white/[0.06] my-3">
              {toggle('enabled', 'Enabled (data is fetched; off pauses everything)')}
              {toggle('visible', 'Visible to clients')}
              {toggle('chart_enabled', 'Chart available')}
              {toggle('automation_enabled', 'Automations available')}
            </div>
            {formError && <p role="alert" className="text-xs text-red-400 mb-3">{formError}</p>}
            <div className="flex gap-2"><button onClick={() => setEdit(null)} disabled={busy} className="flex-1 text-sm text-slate-300 border border-white/[0.1] rounded-xl px-4 py-2.5">Cancel</button><button onClick={save} disabled={busy} className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-2.5 disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

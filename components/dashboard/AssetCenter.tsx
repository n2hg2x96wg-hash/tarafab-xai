'use client'

import { useEffect, useMemo, useState } from 'react'
import { authFetch, readJson } from '@/lib/authFetch'

type Asset = { id?: string; symbol: string; name: string; category: 'crypto' | 'equity' | 'index'; description: string; icon: string; featured?: boolean }
type Quote = { price: number | null; change24h: number | null; volume24hUsd: number | null; status: 'live' | 'unavailable' | 'stale' }
type AssetRow = { asset: Asset; quote: Quote }
type Automation = { id: string; condition: string; threshold: number; status: 'active' | 'paused' | 'triggered' | 'error'; market_assets?: { symbol: string; name: string; icon: string }; market_automation_events?: { id: string; status: string; observed_at: string }[] }

const money = (value: number | null) => value == null ? 'Unavailable' : `$${value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 })}`
const conditionLabels: Record<string, string> = { price_above: 'Price above', price_below: 'Price below', change_above: '24h change above', change_below: '24h change below', volume_above: 'Volume above' }

export function AssetCenter() {
  const [rows, setRows] = useState<AssetRow[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [category, setCategory] = useState<'all' | Asset['category']>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AssetRow | null>(null)
  const [condition, setCondition] = useState('price_above')
  const [threshold, setThreshold] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const market = await fetch('/api/market/assets', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setRows(market?.assets || [])
    const [w, a] = await Promise.all([
      authFetch('/api/client/watchlist').then(r => readJson<{ watchlist: { asset_id: string }[] }>(r)).catch(() => null),
      authFetch('/api/client/automations').then(r => readJson<{ automations: Automation[] }>(r)).catch(() => null),
    ])
    setWatchlist(w?.watchlist.map(item => item.asset_id) || [])
    setAutomations(a?.automations || [])
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => rows.filter(({ asset }) =>
    (category === 'all' || asset.category === category) &&
    `${asset.name} ${asset.symbol}`.toLowerCase().includes(query.toLowerCase()),
  ), [rows, category, query])

  const toggleWatchlist = async (row: AssetRow) => {
    if (!row.asset.id) return
    const remove = watchlist.includes(row.asset.id)
    setWatchlist(list => remove ? list.filter(id => id !== row.asset.id) : [...list, row.asset.id!])
    const response = await authFetch('/api/client/watchlist', { method: 'POST', body: JSON.stringify({ asset_id: row.asset.id, remove }) })
    if (!response.ok) setMessage('Watchlist could not be updated.')
  }

  const createAutomation = async () => {
    if (!selected?.asset.id || !threshold) return
    const response = await authFetch('/api/client/automations', { method: 'POST', body: JSON.stringify({ asset_id: selected.asset.id, condition, threshold: Number(threshold) }) })
    if (!response.ok) { setMessage('Automation could not be created.'); return }
    setThreshold('')
    setSelected(null)
    setMessage('Automation created.')
    load()
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-fg-faint">Asset center</p>
          <h2 className="mt-1 text-xl font-semibold text-fg">Markets, watchlists and automation</h2>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search assets" className="input-field w-full sm:w-56" aria-label="Search assets" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'crypto', 'equity', 'index'] as const).map(item => (
          <button key={item} onClick={() => setCategory(item)} className={`btn btn-sm whitespace-nowrap ${category === item ? 'btn-solid' : 'btn-outline'}`}>
            {item === 'all' ? 'All markets' : item === 'crypto' ? 'Crypto' : item === 'equity' ? 'Equities' : 'Indices'}
          </button>
        ))}
      </div>
      {message && <p role="status" className="text-sm text-accent">{message}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(row => {
          const watched = !!row.asset.id && watchlist.includes(row.asset.id)
          const change = row.quote.change24h
          return <article key={row.asset.symbol} className="panel panel-lift p-4">
            <div className="flex items-start justify-between gap-3">
              <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setSelected(row)}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg text-accent">{row.asset.icon}</span>
                <span className="min-w-0"><strong className="block truncate text-sm text-fg">{row.asset.name}</strong><span className="text-xs text-fg-faint">{row.asset.symbol}</span></span>
              </button>
              <button onClick={() => toggleWatchlist(row)} aria-label={`${watched ? 'Remove' : 'Add'} ${row.asset.symbol} ${watched ? 'from' : 'to'} watchlist`} className="text-lg text-fg-muted hover:text-accent">{watched ? '★' : '☆'}</button>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <span className="text-lg font-semibold tabular-nums text-fg">{money(row.quote.price)}</span>
              {change == null ? <span className="text-xs text-fg-faint">Data unavailable</span> : <span className={`text-xs ${change >= 0 ? 'price-up' : 'price-down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span>}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-fg-faint"><span>{row.quote.status === 'live' ? 'Current data' : 'Unavailable / delayed'}</span><button onClick={() => setSelected(row)} className="text-accent hover:underline">Automate</button></div>
          </article>
        })}
      </div>
      <div className="panel p-5">
        <div className="flex items-center justify-between"><h3 className="font-medium text-fg">My automations</h3><span className="text-xs text-fg-faint">{automations.length} configured</span></div>
        {automations.length === 0 ? <p className="mt-3 text-sm text-fg-muted">Create a condition from any asset card. Automations remain configured until a scheduled evaluation confirms a trigger.</p> : <div className="mt-3 grid gap-2">{automations.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm"><span className="text-fg">{item.market_assets?.icon} {item.market_assets?.symbol} · {conditionLabels[item.condition]} {item.threshold}</span><span className="text-right text-xs text-fg-faint"><span className="block">{item.status === 'triggered' ? 'Executed' : item.status === 'error' ? 'Evaluation failed' : 'Configured'}</span><span>{item.market_automation_events?.length || 0} recorded events</span></span></div>)}</div>}
      </div>
      {selected && <div className="panel border-accent/40 p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-fg">Automate {selected.asset.name}</h3><button onClick={() => setSelected(null)} className="text-fg-muted">Close</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <select value={condition} onChange={e => setCondition(e.target.value)} className="input-field">{Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold" className="input-field" />
          <button onClick={createAutomation} disabled={!threshold} className="btn btn-solid disabled:opacity-50">Create automation</button>
        </div>
        <p className="mt-2 text-xs text-fg-faint">Notifications are sent only after a real market-data evaluation confirms the condition.</p>
      </div>}
    </section>
  )
}

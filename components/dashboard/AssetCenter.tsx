'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'

type Asset = { id?: string; symbol: string; name: string; category: 'crypto' | 'equity' | 'index'; description: string; icon: string; featured?: boolean; automation_enabled?: boolean }
type Quote = { price: number | null; change24h: number | null; volume24hUsd: number | null; updatedAt: string | null; status: 'live' | 'delayed' | 'unavailable' }
type AssetRow = { asset: Asset; quote: Quote }
type Automation = { id: string; condition: string; threshold: number; status: 'active' | 'paused' | 'triggered' | 'error'; market_assets?: { symbol: string; name: string; icon: string }; market_automation_events?: { id: string; status: string; observed_at: string; observed_value: number | null }[] }

const money = (value: number | null) => value == null ? 'Unavailable' : `$${value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 })}`
const conditionLabels: Record<string, string> = { price_above: 'Price above', price_below: 'Price below', change_above: '24h change above', change_below: '24h change below', volume_above: 'Volume above' }

export function AssetCenter() {
  const { t, intl } = useI18n()
  const [rows, setRows] = useState<AssetRow[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [automationLoadError, setAutomationLoadError] = useState(false)
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [category, setCategory] = useState<'all' | Asset['category']>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AssetRow | null>(null)
  const [condition, setCondition] = useState('price_above')
  const [threshold, setThreshold] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const requestKey = useRef(newRequestKey())

  const load = async (includeUserData = true) => {
    try {
      const response = await fetch('/api/market/assets', { cache: 'no-store' })
      if (!response.ok) throw new Error('Market data unavailable')
      const market = await response.json()
      if (!Array.isArray(market?.assets)) throw new Error('Market data unavailable')
      setRows(market.assets)
    } catch {
      setRows(current => current.map(row => ({
        ...row,
        asset: { ...row.asset, automation_enabled: false },
        quote: { price: null, change24h: null, volume24hUsd: null, updatedAt: null, status: 'unavailable' },
      })))
    } finally {
      setAssetsLoading(false)
    }
    if (!includeUserData) return
    const [w, a] = await Promise.all([
      authFetch('/api/client/watchlist').then(r => readJson<{ watchlist: { asset_id: string }[] }>(r)).catch(() => null),
      authFetch('/api/client/automations').then(r => readJson<{ automations: Automation[] }>(r)).catch(() => null),
    ])
    if (w) setWatchlist(w.watchlist.map(item => item.asset_id))
    if (a) {
      setAutomations(a.automations)
      setAutomationLoadError(false)
    } else {
      setAutomationLoadError(true)
    }
  }
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load(false) }, 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { requestKey.current = newRequestKey() }, [selected?.asset.id, condition, threshold])

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
    if (saving || !selected?.asset.id || !threshold.trim() || !selected.asset.automation_enabled) return
    setSaving(true)
    setMessage('')
    try {
      const response = await authFetch('/api/client/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey.current },
        body: JSON.stringify({ asset_id: selected.asset.id, condition, threshold: Number(threshold), idempotency_key: requestKey.current }),
      })
      const { automation } = await readJson<{ automation: Automation }>(response)
      setAutomations(current => [automation, ...current.filter(item => item.id !== automation.id)])
      setAutomationLoadError(false)
      setThreshold('')
      setSelected(null)
      setMessage('Automation saved.')
      requestKey.current = newRequestKey()
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setSaving(false)
    }
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
      {assetsLoading && rows.length === 0 && <p role="status" className="text-sm text-fg-muted">Updating market data…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(row => {
          const watched = !!row.asset.id && watchlist.includes(row.asset.id)
          const change = row.quote.change24h
          const usable = row.asset.automation_enabled === true && row.quote.price !== null
          const status = assetsLoading && row.quote.status === 'unavailable' ? t('common.loading') : row.quote.status === 'live' ? t('status.live') : row.quote.status === 'delayed' ? t('status.delayed') : t('status.dataUnavailable')
          return <article key={row.asset.symbol} className="panel panel-lift p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg text-accent">{row.asset.icon}</span>
                <span className="min-w-0"><strong className="block truncate text-sm text-fg">{row.asset.name}</strong><span className="text-xs text-fg-faint">{row.asset.symbol}</span></span>
              </div>
              <button onClick={() => toggleWatchlist(row)} aria-label={`${watched ? 'Remove' : 'Add'} ${row.asset.symbol} ${watched ? 'from' : 'to'} watchlist`} className="text-lg text-fg-muted hover:text-accent">{watched ? '★' : '☆'}</button>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <span className="text-lg font-semibold tabular-nums text-fg">{money(row.quote.price)}</span>
              {change == null ? <span className="text-xs text-fg-faint">—</span> : <span className={`text-xs ${change >= 0 ? 'price-up' : 'price-down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span>}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-fg-faint">
              <span>{status}{row.quote.updatedAt ? ` · ${t('common.updated', { time: new Date(row.quote.updatedAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) })}` : ''}</span>
              <button onClick={() => setSelected(row)} disabled={!usable} title={usable ? undefined : 'Automation requires usable market data.'} className="text-accent hover:underline disabled:cursor-not-allowed disabled:text-fg-faint disabled:no-underline">Automate</button>
            </div>
            {!usable && <p className="mt-2 text-xs text-fg-faint">Automation requires usable market data.</p>}
          </article>
        })}
      </div>
      <div className="panel p-5">
        <div className="flex items-center justify-between"><h3 className="font-medium text-fg">My automations</h3><span className="text-xs text-fg-faint">{automations.length} configured</span></div>
        {automationLoadError ? <p role="status" className="mt-3 text-sm text-fg-muted">Saved automations could not be loaded. Please refresh and try again.</p>
          : automations.length === 0 ? <p className="mt-3 text-sm text-fg-muted">Create a condition from an asset with usable market data. Notifications are based on scheduled market-data evaluations.</p>
          : <div className="mt-3 grid gap-2">{automations.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm"><span className="text-fg">{item.market_assets?.icon} {item.market_assets?.symbol} · {conditionLabels[item.condition]} {item.threshold}</span><span className="text-right text-xs text-fg-faint"><span className="block">{item.status === 'triggered' ? 'Alert sent' : item.status === 'error' ? 'Evaluation unavailable' : 'Configured'}</span><span>{item.market_automation_events?.length || 0} recorded events</span></span></div>)}</div>}
      </div>
      {selected && <div className="panel border-accent/40 p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-fg">Automate {selected.asset.name}</h3><button onClick={() => setSelected(null)} className="text-fg-muted">Close</button></div>
        {!selected.asset.automation_enabled || selected.quote.price === null
          ? <p className="mt-3 text-sm text-fg-muted">Automation is unavailable until usable market data is received.</p>
          : <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <select value={condition} onChange={e => setCondition(e.target.value)} className="input-field">
                {Object.entries(conditionLabels).map(([value, label]) => {
                  const supported = !value.startsWith('change_') || selected.quote.change24h !== null
                  const hasVolume = value !== 'volume_above' || selected.quote.volume24hUsd !== null
                  return <option key={value} value={value} disabled={!supported || !hasVolume}>{label}{!supported || !hasVolume ? ' (unavailable)' : ''}</option>
                })}
              </select>
              <input type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold" className="input-field" />
              <button onClick={createAutomation} disabled={saving || !threshold.trim() || !Number.isFinite(Number(threshold)) || Number(threshold) < 0} className="btn btn-solid disabled:opacity-50">{saving ? 'Saving…' : 'Create automation'}</button>
            </div>
            <p className="mt-2 text-xs text-fg-faint">Notifications are sent only after a real market-data evaluation confirms the condition.</p>
          </>}
      </div>}
    </section>
  )
}

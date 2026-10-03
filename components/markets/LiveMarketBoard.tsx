'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAssets } from './assetStore'
import { useBtcHistory } from '@/components/useMarket'
import { formatPrice, type AssetQuote } from '@/lib/assets'
import { chartColors } from '@/lib/chartColors'
import { MarketSources } from './MarketSources'

// Real market board for the landing page (replaces the decorative globe).
// Every number comes from /api/market/assets (quotes recorded server-side by
// the market engine from Coinbase Exchange / CoinGecko / Finnhub). Nothing is
// estimated: an asset without a current quote is never drawn as live, and a
// failed feed says so. The 24h line is labelled as history, not live data.

const STATE_LABEL: Record<string, string> = { live: 'Live', delayed: 'Delayed', stale: 'Stale', unavailable: 'Unavailable', error: 'Unavailable' }
const STATE_TONE: Record<string, string> = { live: 'bg-emerald-400', delayed: 'bg-amber-400', stale: 'bg-amber-400', unavailable: 'bg-fg-faint', error: 'bg-fg-faint' }

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

// Re-render every few seconds for the "updated … ago" labels, only while the
// board is on screen and the tab is visible.
function useClock(active: boolean, ms = 5000) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') tick(n => n + 1) }, ms)
    return () => clearInterval(t)
  }, [active, ms])
}

function Tile({ a }: { a: AssetQuote }) {
  const prev = useRef<number | null>(a.price)
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('')
  useEffect(() => {
    const p = prev.current
    prev.current = a.price
    if (p == null || a.price == null || p === a.price) return
    setFlash(a.price > p ? 'up' : 'down')
    const t = setTimeout(() => setFlash(''), 900)
    return () => clearTimeout(t)
  }, [a.price])
  const usable = a.price != null && (a.state === 'live' || a.state === 'delayed' || a.state === 'stale')
  const up = (a.changePct ?? 0) >= 0
  return (
    <li className={`market-tile panel p-3 sm:p-3.5 ${a.state === 'live' ? 'market-tile-live' : ''}`} data-asset={a.id} data-state={a.state}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-fg">{a.id}</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-faint">
          <span className={`w-1.5 h-1.5 rounded-full ${STATE_TONE[a.state] || 'bg-fg-faint'}`} aria-hidden="true" />{STATE_LABEL[a.state] || a.state}
        </span>
      </div>
      <p className="text-[11px] text-fg-faint truncate">{a.name}</p>
      {usable ? (
        <>
          <p className={`mt-2 text-[17px] sm:text-[18px] font-semibold tabular-nums text-fg price-tick ${flash === 'up' ? 'price-up' : flash === 'down' ? 'price-down' : ''}`}>{formatPrice(a.price!)}</p>
          {a.changePct != null && <p className={`text-[12px] tabular-nums font-medium ${up ? 'price-up' : 'price-down'}`}>{up ? '+' : '−'}{Math.abs(a.changePct).toFixed(2)}% <span className="text-fg-faint font-normal">24h</span></p>}
        </>
      ) : <p className="mt-2 text-[13px] text-fg-faint">No current quote</p>}
    </li>
  )
}

function DayLine() {
  const h = useBtcHistory('1')
  const pts = h.history?.points.map(([, p]) => p) || null
  if (h.status === 'error') return <p className="text-[12px] text-fg-faint">24h history unavailable right now.</p>
  if (!pts || pts.length < 2) return <div className="h-14 rounded-md skeleton-sheen" aria-hidden="true" />
  const w = 400, hh = 56, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${(hh - ((p - min) / span) * (hh - 8) - 4).toFixed(1)}`).join(' ')
  const color = pts[pts.length - 1] >= pts[0] ? chartColors.up : chartColors.down
  return (
    <svg viewBox={`0 0 ${w} ${hh}`} className="w-full h-14" preserveAspectRatio="none" role="img" aria-label="Bitcoin price over the last 24 hours (historical data)">
      <path d={`${d} L${w},${hh} L0,${hh} Z`} style={{ fill: color, fillOpacity: 0.08 }} />
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function LiveMarketBoard() {
  const { assets, error, at, reload } = useAssets()
  const ref = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(e => setOnScreen(e[0].isIntersecting)); io.observe(el); return () => io.disconnect()
  }, [])
  useClock(onScreen)

  const { tiles, offline, sources, newest, liveCount } = useMemo(() => {
    const list = assets || []
    const crypto = list.filter(a => a.category === 'crypto')
    const tiles = [...crypto].sort((x, y) => (x.id === 'BTC' ? -1 : y.id === 'BTC' ? 1 : 0)).slice(0, 8)
    const offline = list.filter(a => a.category !== 'crypto' && !(a.price != null && (a.state === 'live' || a.state === 'delayed')))
    const shownSources = new Set<string>()
    tiles.forEach(a => { if (a.source && a.price != null) shownSources.add(a.source) })
    shownSources.add('CoinGecko') // fallback provider for BTC summary/history on this page
    const times = list.map(a => (a.updatedAt ? Date.parse(a.updatedAt) : NaN)).filter(Number.isFinite)
    return { tiles, offline, sources: Array.from(shownSources), newest: times.length ? Math.max(...times) : null, liveCount: tiles.filter(a => a.state === 'live').length }
  }, [assets])

  const state: 'loading' | 'error' | 'stale' | 'live' = assets === null ? (error ? 'error' : 'loading')
    // The last refresh failed: whatever is on screen is no longer current.
    : error ? (tiles.some(a => a.price != null) ? 'stale' : 'error')
    : liveCount ? 'live' : tiles.some(a => a.price != null) ? 'stale' : 'error'

  return (
    <div ref={ref} className="panel p-4 sm:p-5 market-board" data-board-state={state} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">Markets right now</h3>
          <p className="text-[12px] text-fg-faint">
            {state === 'loading' ? 'Loading current quotes…'
              : state === 'error' ? 'Market data is unavailable right now.'
              : `${liveCount} of ${tiles.length} live${newest ? ` · updated ${ago(Date.now() - newest)}` : ''}`}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${state === 'live' ? 'border-emerald-500/30 text-emerald-300' : state === 'loading' ? 'border-ink-600 text-fg-faint' : 'border-amber-500/30 text-amber-300'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${state === 'live' ? 'bg-emerald-400 board-pulse' : state === 'loading' ? 'bg-fg-faint' : 'bg-amber-400'}`} aria-hidden="true" />
          {state === 'live' ? 'Live feed' : state === 'loading' ? 'Connecting' : state === 'stale' ? 'Delayed' : 'Unavailable'}
        </span>
      </div>

      {state === 'loading' ? (
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <li key={i} className="h-[92px] rounded-lg border border-ink-700/70 skeleton-sheen" />)}
        </ul>
      ) : state === 'error' && !tiles.length ? (
        <div className="mt-4 rounded-lg border border-ink-700 p-5 text-center text-[13px] text-fg-muted">
          We could not load current quotes. Nothing is shown rather than an estimate.{' '}
          <button onClick={() => reload()} className="underline underline-offset-2 hover:text-fg">Try again</button>
          {at ? <span className="block mt-1 text-[11px] text-fg-faint">Last attempt {ago(Date.now() - at)}</span> : null}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">{tiles.map(a => <Tile key={a.id} a={error && a.state === 'live' ? { ...a, state: 'stale' } : a} />)}</ul>
      )}

      <div className="mt-4 rounded-lg border border-ink-700/70 px-3 pt-2 pb-1">
        <div className="flex items-center justify-between text-[11px] text-fg-faint"><span>BTC · last 24 hours</span><span>Historical</span></div>
        <DayLine />
      </div>

      {offline.length > 0 && state !== 'loading' && (
        <p className="mt-3 text-[12px] text-fg-faint" data-offline-note>
          Stocks &amp; indices ({offline.slice(0, 4).map(a => a.id).join(', ')}{offline.length > 4 ? '…' : ''}): no current quote right now — shown as unavailable, never estimated.
        </p>
      )}
      <MarketSources sources={sources} className="mt-3 pt-3 border-t border-ink-700/70" />
    </div>
  )
}

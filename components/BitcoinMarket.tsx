'use client'

import { useEffect, useRef, useState } from 'react'
import { compactUsd, useBtcHistory, useBtcSummary } from '@/components/useMarket'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { MarketStatusPill } from '@/components/LandingExtras'
import { AnimatedPrice, freshnessText, useNow } from '@/components/MarketBits'

// Whole dollars for the compact 24h tiles (full precision stays on the price).
const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BitcoinMarketCard() {
  const { summary: data, status, fetchedAt, retry } = useBtcSummary(60_000)
  const { t } = useI18n()
  useNow()

  const up = (data?.change24h ?? 0) >= 0
  const stats: [TKey, string | null][] = [
    ['market.high24h', data ? usd0(data.high24h) : null],
    ['market.low24h', data ? usd0(data.low24h) : null],
    ['market.volume24h', data ? compactUsd(data.volume24hUsd) : null],
  ]

  return (
    <div className="panel panel-lift ov-glass p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-fg-muted">{t('market.bitcoinMarket')} <span className="text-fg-faint whitespace-nowrap">BTC/USD</span></h3>
        <MarketStatusPill status={status} />
      </div>

      {/* Primary: the price */}
      <div className="mt-3 min-h-[64px]">
        {data ? (
          <>
            <AnimatedPrice value={data.price} format={usd} className="text-[30px] sm:text-[34px] leading-none font-semibold tracking-tight text-fg" />
            <div className={`mt-2 text-sm tabular-nums ${up ? 'price-up' : 'price-down'}`}>
              <span aria-hidden="true">{up ? '▲' : '▼'}</span> {Math.abs(data.change24h).toFixed(2)}% <span className="text-fg-faint">24h</span>
            </div>
          </>
        ) : status === 'error' ? (
          <p className="text-sm text-fg-muted pt-2">{t('market.unavailable')}</p>
        ) : (
          <div className="space-y-2" aria-label={t('common.loading')}><div className="skeleton h-9 w-48" /><div className="skeleton h-4 w-24" /></div>
        )}
      </div>

      {/* Real 24h price path (Coinbase hourly closes via /api/market/btc/history).
          Drawn only when that history has loaded; nothing is estimated. */}
      <BtcArea up={up} />

      {/* Secondary: 24h statistics */}
      <dl className="grid grid-cols-3 gap-2 mt-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[rgb(var(--contrast)/.035)] border border-[rgb(var(--contrast)/.06)] px-3 py-2.5 min-w-0">
            <dt className="text-[11px] text-fg-faint truncate">{t(label)}</dt>
            <dd className="text-[13px] font-medium tabular-nums text-fg mt-0.5 truncate">
              {value ?? (status === 'error' ? '—' : <span className="skeleton inline-block w-14 h-4 align-middle" />)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[12px] text-fg-faint">
        <span aria-live="polite">{freshnessText(t, status, fetchedAt)}</span>
        <button onClick={retry} disabled={status === 'loading'} className="inline-flex items-center min-h-9 px-2.5 -mr-2.5 rounded-md hover:text-fg hover:bg-ink-850 transition-colors shrink-0 disabled:opacity-50">
          {status === 'error' || status === 'stale' ? t('common.tryAgain') : t('common.refresh')}
        </button>
      </div>
    </div>
  )
}

// 24h area chart of real closing prices. It draws itself in once when it
// first scrolls into view and only re-renders when new history arrives.
function BtcArea({ up }: { up: boolean }) {
  const { history, status } = useBtcHistory('1')
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setSeen(true); io.disconnect() } })
    io.observe(el); return () => io.disconnect()
  }, [])
  const pts = history?.points || []
  if (status === 'error' || (status === 'ready' && pts.length < 2)) return null
  const W = 300, H = 72
  let d = '', area = ''
  if (pts.length >= 2) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * W
    const sy = (y: number) => H - 4 - ((y - y0) / (y1 - y0 || 1)) * (H - 10)
    d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('')
    area = `${d}L${W},${H}L0,${H}Z`
  }
  const c = up ? 'var(--chart-up, 52 211 153)' : 'var(--chart-down, 248 113 113)'
  return (
    <div ref={ref} className="mt-4 -mx-1 h-[72px]" data-btc-chart={pts.length ? 'ready' : 'loading'} aria-label="Bitcoin price over the last 24 hours" role="img">
      {pts.length >= 2 ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full h-full overflow-visible ${seen ? 'btc-draw' : 'opacity-0'}`} aria-hidden="true">
          <defs>
            <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgb(${c})`} stopOpacity=".28" />
              <stop offset="100%" stopColor={`rgb(${c})`} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#btcFill)" className="btc-area" />
          <path d={d} fill="none" stroke={`rgb(${c})`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="btc-line" />
        </svg>
      ) : <div className="skeleton h-full w-full rounded-lg" />}
    </div>
  )
}

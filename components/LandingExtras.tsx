'use client'

import { chartColors } from '@/lib/chartColors'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { compactUsd, useBtcHistory, useBtcSummary, type SummaryStatus } from '@/components/useMarket'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { AnimatedPrice, freshnessText } from '@/components/MarketBits'

const usd = (n: number, d = 2) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`

/* Scroll reveal: content is visible by default and only hidden once JS has
   confirmed it is below the fold, so a failed script never hides anything. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return
    setState('hidden')
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setState('shown'); io.disconnect() }
    }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`${state === 'hidden' ? 'opacity-0 translate-y-5' : 'opacity-100 translate-y-0'} transition-[opacity,transform] duration-700 ease-out ${className}`}
      style={{ transitionDelay: state === 'shown' ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

function SectionHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight text-fg">{title}</h2>
      <p className="mt-3 text-fg-muted">{body}</p>
    </div>
  )
}

/* Bitcoin market panel: live summary, range-selectable history, hover readout.
   Data comes from our own cached /api/market routes (see lib/market.ts). */
const RANGES = [
  { id: '7', label: '7D' },
  { id: '30', label: '30D' },
  { id: '365', label: '1Y' },
  { id: '1825', label: '5Y' },
] as const

export function MarketStatusPill({ status }: { status: SummaryStatus }) {
  const { t } = useI18n()
  const map = {
    live: { t: t('status.live'), c: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]', d: 'bg-emerald-400', pulse: true },
    stale: { t: t('status.delayed'), c: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.06]', d: 'bg-amber-400', pulse: false },
    loading: { t: t('common.loading'), c: 'text-fg-muted border-ink-600', d: 'bg-fg-faint', pulse: false },
    error: { t: t('common.unavailable'), c: 'text-red-400 border-red-500/30 bg-red-500/[0.06]', d: 'bg-red-400', pulse: false },
  }[status]
  return (
    <span className={`tag ${map.c} ${status === 'live' ? 'live-pill' : ''}`}>
      <span className="relative flex w-1.5 h-1.5">
        {map.pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${map.d} live-breathe`} />}
        <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${map.d}`} />
      </span>
      {map.t}
    </span>
  )
}

function useTicker(ms = 15_000) {
  const [, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN(n => n + 1), ms); return () => clearInterval(t) }, [ms])
}

// compact: the public page shows status, price, period and chart only; the
// 24h figures stay in the dashboard's Price history.
export function PriceHistory({ compact = false }: { compact?: boolean } = {}) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30')
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const market = useBtcSummary()
  const hist = useBtcHistory(range)
  const { t, intl } = useI18n()
  useTicker()
  const data = hist.history?.points

  const w = 800, h = 260, pad = 8
  const geo = useMemo(() => {
    if (!data || data.length < 2) return null
    const prices = data.map(d => d[1])
    const min = Math.min(...prices), max = Math.max(...prices)
    const span = max - min || 1
    const pts = data.map(([t, p], i) => ({ t, p, x: (i / (data.length - 1)) * w, y: pad + (1 - (p - min) / span) * (h - pad * 2) }))
    const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')
    return { pts, line, min, max, first: prices[0], last: prices[prices.length - 1] }
  }, [data])

  const onMove = (clientX: number) => {
    if (!geo || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const i = Math.round(((clientX - r.left) / r.width) * (geo.pts.length - 1))
    setHover(Math.max(0, Math.min(geo.pts.length - 1, i)))
  }

  const hovered = geo && hover !== null ? geo.pts[hover] : null
  const change = geo ? ((geo.last - geo.first) / geo.first) * 100 : 0
  const up = change >= 0
  const color = up ? chartColors.up : chartColors.down
  const longRange = range === '365' || range === '1825'
  const s = market.summary
  const headlinePrice = hovered ? hovered.p : s?.price ?? geo?.last
  const source = s?.source ?? hist.history?.source

  const stats: [TKey, string | null][] = [
    ['market.change24h', s ? `${s.change24h >= 0 ? '+' : '-'}${Math.abs(s.change24h).toFixed(2)}%` : null],
    ['market.high24h', s ? usd(s.high24h) : null],
    ['market.low24h', s ? usd(s.low24h) : null],
    ['market.volume24h', s ? compactUsd(s.volume24hUsd) : null],
  ]

  return (
    <div className="panel panel-lift overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[13px] text-fg-faint">
              <span>{hovered ? t('market.priceOn', { date: new Date(hovered.t).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric', ...(longRange ? {} : { hour: '2-digit', minute: '2-digit' }) }) }) : 'BTC / USD'}</span>
              {!hovered && <MarketStatusPill status={market.status} />}
            </div>
            <div className="text-[32px] sm:text-4xl font-semibold text-fg tabular-nums mt-1.5 leading-none tracking-tight">
              {hovered ? usd(hovered.p)
                : headlinePrice !== undefined ? <AnimatedPrice value={headlinePrice} format={usd} />
                : <span className="skeleton inline-block w-52 h-9 align-middle" />}
            </div>
            <div className="h-5 mt-2 text-sm tabular-nums">
              {geo && (
                <span className={up ? 'price-up' : 'price-down'}>
                  {up ? '+' : '-'}{Math.abs(change).toFixed(2)}% <span className="text-fg-faint">{t('market.over', { range: RANGES.find(r => r.id === range)!.label })}</span>
                </span>
              )}
            </div>
          </div>
          <div className="seg" role="tablist" aria-label={t('market.chartRange')}>
            {RANGES.map(r => (
              <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => { setRange(r.id); setHover(null) }}
                className={`seg-btn ${range === r.id ? 'seg-btn-on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {!compact && <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-md bg-ink-850 px-3.5 py-2.5 min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-fg-faint">{t(label)}</dt>
              <dd className={`text-sm font-medium tabular-nums mt-0.5 ${label === 'market.change24h' && s ? (s.change24h >= 0 ? 'price-up' : 'price-down') : 'text-fg'}`}>
                {value ?? (market.status === 'error' ? <span className="text-fg-faint">{t('common.unavailable')}</span> : <span className="skeleton inline-block w-16 h-4 align-middle" />)}
              </dd>
            </div>
          ))}
        </dl>}
      </div>

      <div className="relative px-2 sm:px-3">
        {hist.status === 'error' && !geo ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-fg-muted">{t('market.historyFailed', { range: RANGES.find(r => r.id === range)!.label })}</p>
            <p className="text-xs text-fg-faint max-w-xs">{t('market.historyFailedBody')}</p>
            <button onClick={hist.retry} className="btn btn-sm btn-outline mt-1">{t('common.tryAgain')}</button>
          </div>
        ) : !geo ? (
          <div className="h-[260px] px-2 flex flex-col justify-end gap-2 pb-2" aria-label={t('market.loadingHistory')}>
            <div className="skeleton h-full rounded-md opacity-60" />
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            className={`w-full h-[260px] touch-none cursor-crosshair transition-opacity duration-300 ${hist.status === 'loading' ? 'opacity-40' : 'opacity-100'}`}
            onMouseMove={e => onMove(e.clientX)}
            onMouseLeave={() => setHover(null)}
            onTouchMove={e => onMove(e.touches[0].clientX)}
            onTouchEnd={() => setHover(null)}
            role="img"
            aria-label={t('market.chartAria', { range: RANGES.find(r => r.id === range)!.label })}
          >
            <defs>
              <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {[1 / 3, 2 / 3].map(f => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} style={{ stroke: chartColors.grid }} strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />)}
            <path d={`${geo.line} L${w},${h} L0,${h} Z`} fill="url(#phFill)" />
            <path d={geo.line} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-draw" key={range} />
            {hovered && (
              <line x1={hovered.x} x2={hovered.x} y1="0" y2={h} style={{ stroke: chartColors.guide }} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        )}
        {geo && hovered && (
          // HTML overlay so the dot stays round and the tooltip stays crisp at
          // any chart width (the SVG itself is stretched to fit).
          <div className="pointer-events-none absolute inset-y-0 left-2 right-2 sm:left-3 sm:right-3" aria-hidden="true">
            <span className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full ring-2 ring-ink-900" style={{ left: `${(hovered.x / w) * 100}%`, top: `${(hovered.y / h) * 100}%`, background: color }} />
            <div
              className="absolute top-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-600 bg-ink-900/95 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgb(var(--shadow)/.6)] backdrop-blur-sm"
              style={{ left: `clamp(64px, ${(hovered.x / w) * 100}%, calc(100% - 64px))` }}
            >
              <div className="text-[13px] font-semibold text-fg tabular-nums">{usd(hovered.p)}</div>
              <div className="text-[11px] text-fg-faint">{new Date(hovered.t).toLocaleString(intl, { month: 'short', day: 'numeric', year: longRange ? 'numeric' : undefined, ...(longRange ? {} : { hour: '2-digit', minute: '2-digit' }) })}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 sm:px-6 py-3 border-t border-ink-700 text-[11px] text-fg-faint">
        <span>
          {geo ? t('market.lowHigh', { low: usd(geo.min, 0), high: usd(geo.max, 0) }) : ' '}
          {market.fetchedAt && <> · {freshnessText(t, market.status, market.fetchedAt)}</>}
          {market.status === 'stale' && <> · <button onClick={market.retry} className="underline underline-offset-2 hover:text-fg">{t('common.refresh')}</button></>}
        </span>
      </div>
    </div>
  )
}

/* BTC <-> USD converter using the live price */
export function Converter({ price }: { price?: number }) {
  const [usdVal, setUsdVal] = useState('1000')
  const [btcVal, setBtcVal] = useState('')
  const [last, setLast] = useState<'usd' | 'btc'>('usd')
  const { t } = useI18n()

  useEffect(() => {
    if (!price) return
    if (last === 'usd') {
      const n = parseFloat(usdVal)
      setBtcVal(Number.isFinite(n) ? (n / price).toFixed(8).replace(/\.?0+$/, '') : '')
    } else {
      const n = parseFloat(btcVal)
      setUsdVal(Number.isFinite(n) ? (n * price).toFixed(2) : '')
    }
  }, [price, usdVal, btcVal, last])

  return (
    <div className="panel p-5 sm:p-6 flex flex-col">
      <h3 className="text-[15px] font-semibold text-fg">{t('market.calculator')}</h3>
      <p className="text-[13px] text-fg-faint mt-1 mb-5">{t('market.calculatorBody')}</p>
      <div className="space-y-3">
        <div>
          <label htmlFor="conv-usd" className="field-label">{t('market.usDollars')}</label>
          <input id="conv-usd" type="number" inputMode="decimal" min="0" value={usdVal} onChange={e => { setLast('usd'); setUsdVal(e.target.value) }} className="field tabular-nums" />
        </div>
        <div>
          <label htmlFor="conv-btc" className="field-label">{t('market.bitcoin')}</label>
          <input id="conv-btc" type="number" inputMode="decimal" min="0" value={btcVal} onChange={e => { setLast('btc'); setBtcVal(e.target.value) }} className="field tabular-nums" placeholder={price ? '' : t('market.waitingPrice')} />
        </div>
      </div>
      <div className="mt-auto pt-5 text-[13px] text-fg-muted tabular-nums">
        {price ? <>1 BTC = {usd(price)}<br />$1 = {(1 / price).toFixed(8)} BTC ({Math.round(1e8 / price).toLocaleString()} sats)</> : t('market.livePriceUnavailable')}
      </div>
    </div>
  )
}

/* Network facts: halving, supply, mempool, difficulty */
interface Facts {
  height?: number
  circulating?: number
  ath?: number
  athDate?: string
  athChange?: number
  mempoolCount?: number
  mempoolVsize?: number
  diffProgress?: number
  diffRemaining?: number
  diffChange?: number
  diffEta?: number
}

function useFacts() {
  const [f, setF] = useState<Facts>({})
  const [loaded, setLoaded] = useState({ chain: false, supply: false })
  useEffect(() => {
    let alive = true
    const chain = async () => {
      try {
        const [h, m, d] = await Promise.all([
          fetch('https://mempool.space/api/blocks/tip/height').then(r => (r.ok ? r.text() : Promise.reject())),
          fetch('https://mempool.space/api/mempool').then(r => (r.ok ? r.json() : null)).catch(() => null),
          fetch('https://mempool.space/api/v1/difficulty-adjustment').then(r => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (!alive) return
        setF(prev => ({
          ...prev,
          height: parseInt(h, 10),
          mempoolCount: m?.count, mempoolVsize: m?.vsize,
          diffProgress: d?.progressPercent, diffRemaining: d?.remainingBlocks, diffChange: d?.difficultyChange, diffEta: d?.estimatedRetargetDate,
        }))
      } catch { /* shown as unavailable */ }
      if (alive) setLoaded(l => ({ ...l, chain: true }))
    }
    const supply = async () => {
      try {
        const j = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false').then(r => (r.ok ? r.json() : Promise.reject()))
        if (!alive) return
        const md = j.market_data
        setF(prev => ({ ...prev, circulating: md?.circulating_supply, ath: md?.ath?.usd, athDate: md?.ath_date?.usd, athChange: md?.ath_change_percentage?.usd }))
      } catch { /* shown as unavailable */ }
      if (alive) setLoaded(l => ({ ...l, supply: true }))
    }
    chain(); supply()
    const t = setInterval(chain, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return { f, loaded }
}

function Bar({ value }: { value: number }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(value), 150); return () => clearTimeout(t) }, [value])
  return (
    <div className="h-1.5 rounded-sm bg-ink-700 overflow-hidden">
      <div className="h-full bg-accent transition-[width] duration-1000 ease-out" style={{ width: `${Math.min(100, Math.max(0, w))}%` }} />
    </div>
  )
}

// Supporting data: a lighter card than the primary price panels. The data
// source lives in the page's single "Data sources" note, not under each card.
// In the client dashboard the facts sit as divided rows of one section
// instead of four separate cards (variant="rows").
function FactRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full p-4 sm:p-5 flex flex-col bg-[rgb(var(--ink-900))] [&_.fact-big]:text-[22px] [&_.fact-big]:sm:text-2xl" data-fact-row>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint mb-2">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function FactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full rounded-[10px] border border-ink-700 bg-ink-900/50 p-5 flex flex-col transition-colors hover:border-ink-600">
      <h3 className="text-[12px] font-medium uppercase tracking-[0.1em] text-fg-faint mb-3">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Unavailable() {
  const { t } = useI18n()
  return <p className="text-sm text-fg-faint">{t('common.unavailableNow')}</p>
}
const Loading = () => <div className="space-y-2"><div className="skeleton h-8 w-40" /><div className="skeleton h-4 w-full" /></div>

export function NetworkFacts({ variant = 'cards' }: { variant?: 'cards' | 'rows' } = {}) {
  const { f, loaded } = useFacts()
  const Card = variant === 'rows' ? FactRow : FactCard
  const { t, intl } = useI18n()
  const HALVING = 210_000
  const h = f.height
  const nextHalving = h !== undefined ? Math.ceil((h + 1) / HALVING) * HALVING : undefined
  const blocksLeft = h !== undefined && nextHalving ? nextHalving - h : undefined
  const epochProgress = h !== undefined ? ((h % HALVING) / HALVING) * 100 : 0
  const reward = h !== undefined ? 50 / 2 ** Math.floor(h / HALVING) : undefined
  const eta = blocksLeft ? new Date(Date.now() + blocksLeft * 10 * 60_000) : undefined

  return (
    <div className={variant === 'rows' ? 'grid sm:grid-cols-2 gap-px bg-[rgb(var(--contrast)/.07)] rounded-2xl overflow-hidden border border-[rgb(var(--contrast)/.07)]' : 'grid md:grid-cols-2 xl:grid-cols-4 gap-4'} data-network-facts={variant}>
      <Reveal className="h-full">
        <Card title={t('network.halving')}>
          {!loaded.chain ? <Loading /> : blocksLeft === undefined ? <Unavailable /> : (
            <>
              <div className="fact-big text-3xl font-semibold text-fg tabular-nums">{blocksLeft.toLocaleString()}</div>
              <div className="text-[13px] text-fg-muted mb-4">{t('network.blocksToGo', { date: eta!.toLocaleDateString(intl, { month: 'long', year: 'numeric' }) })}</div>
              <Bar value={epochProgress} />
              <div className="flex justify-between text-xs text-fg-faint mt-2 tabular-nums">
                <span>{t('network.block', { n: h!.toLocaleString() })}</span><span>{nextHalving!.toLocaleString()}</span>
              </div>
              <p className="text-[13px] text-fg-muted mt-4">{t('network.reward', { reward: String(reward), next: String(reward! / 2) })}</p>
            </>
          )}
        </Card>
      </Reveal>

      <Reveal delay={80} className="h-full">
        <Card title={t('network.supply')}>
          {!loaded.supply ? <Loading /> : !f.circulating ? <Unavailable /> : (
            <>
              <div className="fact-big text-3xl font-semibold text-fg tabular-nums">{(f.circulating / 1e6).toFixed(2)}M</div>
              <div className="text-[13px] text-fg-muted mb-4">{t('network.mined', { pct: ((f.circulating / 21e6) * 100).toFixed(2) })}</div>
              <Bar value={(f.circulating / 21e6) * 100} />
              <p className="text-[13px] text-fg-muted mt-4">{t('network.left', { n: ((21e6 - f.circulating) / 1e6).toFixed(2) })}</p>
            </>
          )}
        </Card>
      </Reveal>

      <Reveal delay={160} className="h-full">
        <Card title={t('network.ath')}>
          {!loaded.supply ? <Loading /> : !f.ath ? <Unavailable /> : (
            <>
              <div className="fact-big text-3xl font-semibold text-fg tabular-nums">{usd(f.ath, 0)}</div>
              <div className="text-[13px] text-fg-muted mb-4">{f.athDate ? t('network.reached', { date: new Date(f.athDate).toLocaleDateString(intl, { month: 'long', day: 'numeric', year: 'numeric' }) }) : t('network.reachedUnknown')}</div>
              {f.athChange !== undefined && (
                <p className="text-[13px] text-fg-muted">
                  {t(f.athChange >= 0 ? 'network.athAbove' : 'network.athBelow', { pct: Math.abs(f.athChange).toFixed(1) })}
                </p>
              )}
            </>
          )}
        </Card>
      </Reveal>

      <Reveal delay={240} className="h-full">
        <Card title={t('network.activity')}>
          {!loaded.chain ? <Loading /> : f.mempoolCount === undefined && f.diffProgress === undefined ? <Unavailable /> : (
            <dl className="space-y-4">
              {f.mempoolCount !== undefined && (
                <div>
                  <dt className="text-[13px] text-fg-faint">{t('network.waiting')}</dt>
                  <dd className="text-2xl font-semibold text-fg tabular-nums">{f.mempoolCount.toLocaleString()}</dd>
                  {f.mempoolVsize !== undefined && <dd className="text-xs text-fg-faint">{t('network.blocksWorth', { n: Math.max(1, Math.round(f.mempoolVsize / 1e6)) })}</dd>}
                </div>
              )}
              {f.diffProgress !== undefined && (
                <div>
                  <dt className="text-[13px] text-fg-faint mb-2">{t('network.difficulty')}</dt>
                  <dd><Bar value={f.diffProgress} /></dd>
                  <dd className="text-xs text-fg-muted mt-2 tabular-nums">
                    {t('network.blocksLeft', { n: f.diffRemaining?.toLocaleString() ?? '' })}
                    {f.diffChange !== undefined && t('network.estimated', { pct: `${f.diffChange >= 0 ? '+' : ''}${f.diffChange.toFixed(2)}` })}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Card>
      </Reveal>
    </div>
  )
}

/* FAQ */
const FAQ: { q: TKey; a: TKey }[] = [
  { q: 'faq.q1', a: 'faq.a1' },
  { q: 'faq.q2', a: 'faq.a2' },
  { q: 'faq.q3', a: 'faq.a3' },
  { q: 'faq.q4', a: 'faq.a4' },
  { q: 'faq.q5', a: 'faq.a5' },
  { q: 'faq.q6', a: 'faq.a6' },
]

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  const { t } = useI18n()
  return (
    <div className="divide-y divide-ink-700 border-y border-ink-700">
      {FAQ.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-6 py-5 text-left text-[16px] text-fg hover:text-accent transition-colors"
            >
              {t(item.q)}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`shrink-0 text-fg-faint transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-10 text-[15px] text-fg-muted leading-relaxed">{t(item.a)}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Sections placed into the landing page */
export function HistorySection({ price }: { price?: number }) {
  const { t } = useI18n()
  return (
    <section className="border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <Reveal><SectionHead title={t('market.historyTitle')} body={t('market.historyBody')} /></Reveal>
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Reveal><PriceHistory /></Reveal>
          <Reveal delay={100} className="h-full"><Converter price={price} /></Reveal>
        </div>
      </div>
    </section>
  )
}

export function NetworkSection() {
  const { t } = useI18n()
  return (
    <section className="border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <Reveal><SectionHead title={t('network.title')} body={t('network.body')} /></Reveal>
        <NetworkFacts />
      </div>
    </section>
  )
}

export function FaqSection() {
  const { t } = useI18n()
  return (
    <section id="faq" className="scroll-mt-16 border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-[1fr_1.6fr] gap-10">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-fg">{t('faq.title')}</h2>
          <p className="mt-3 text-fg-muted">{t('faq.body')}</p>
        </Reveal>
        <Reveal delay={100}><FaqList /></Reveal>
      </div>
    </section>
  )
}

/* Trust bar: every claim here is true and checkable — no invented activity,
   no promised returns. Legitimacy comes from verifiability, not from
   claiming automation that doesn't exist. */
// minimal: the public hero shows only the account assurances, not feed status.
export function TrustBar({ marketStatus, minimal = false }: { marketStatus?: 'connecting' | 'live' | 'polling' | 'error'; minimal?: boolean }) {
  const liveFeed = marketStatus === 'live' || marketStatus === 'polling'
  const { t } = useI18n()
  const items: { label: string; sub: string }[] = [
    // A failed feed says so; "Refreshing" is only shown while it is still connecting.
    { label: t(liveFeed ? 'trust.liveData' : 'trust.marketData'), sub: t(liveFeed ? 'trust.streaming' : marketStatus === 'error' ? 'landing.status.unavailable' : 'trust.refreshing') },
    { label: t('trust.review'), sub: t('trust.reviewSub') },
    { label: t('trust.audit'), sub: t('trust.auditSub') },
    { label: t('trust.access'), sub: t('trust.accessSub') },
  ]
  if (minimal) return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-fg-muted">
      {items.slice(1).map(item => (
        <li key={item.label} className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent/80" aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  )
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 py-5 border-y border-ink-700">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full ${liveFeed ? 'bg-emerald-400 animate-ping opacity-60' : 'bg-fg-faint'}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${liveFeed ? 'bg-emerald-400' : marketStatus === 'error' && item.label === t('trust.marketData') ? 'bg-amber-400' : 'bg-fg-faint'}`} />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-fg">{item.label}</div>
            <div className="text-[11px] text-fg-faint">{item.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Small status layer. Each indicator reflects something actually checked:
// market data = the live feed's own state; platform = /api/health, which asks
// the authentication service; security = whether this page is on an encrypted
// connection. Nothing is shown as healthy before it has been checked.
export function PlatformStatus({ marketStatus }: { marketStatus?: 'connecting' | 'live' | 'polling' | 'error' }) {
  const { t } = useI18n()
  const [platform, setPlatform] = useState<'checking' | 'operational' | 'degraded'>('checking')
  const [secure, setSecure] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    setSecure(window.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(window.location.hostname))
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    fetch('/api/health', { signal: ctrl.signal }).then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) setPlatform(d?.platform === 'operational' ? 'operational' : 'degraded') })
      .catch(() => { if (alive) setPlatform('degraded') })
      .finally(() => clearTimeout(timer))
    return () => { alive = false; ctrl.abort() }
  }, [])
  const market = marketStatus === 'live' || marketStatus === 'polling' ? 'ok' : marketStatus === 'error' ? 'bad' : 'wait'
  const items: { label: string; value: string; tone: 'ok' | 'bad' | 'wait' }[] = [
    { label: t('landing.status.market'), value: t(market === 'ok' ? 'landing.status.connected' : market === 'bad' ? 'landing.status.unavailable' : 'landing.status.connecting'), tone: market },
    { label: t('landing.status.platform'), value: t(platform === 'operational' ? 'landing.status.operational' : platform === 'degraded' ? 'landing.status.degraded' : 'landing.status.checking'), tone: platform === 'operational' ? 'ok' : platform === 'degraded' ? 'bad' : 'wait' },
    { label: t('landing.status.security'), value: t(secure === false ? 'landing.status.unencrypted' : 'landing.status.encrypted'), tone: secure === null ? 'wait' : secure ? 'ok' : 'bad' },
  ]
  const dot = { ok: 'bg-emerald-400', bad: 'bg-amber-400', wait: 'bg-fg-faint' }
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('landing.status.title')}>
      {items.map(i => (
        <li key={i.label} className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 backdrop-blur-sm px-3 py-1.5 text-[12px]">
          <span className={`w-1.5 h-1.5 rounded-full ${dot[i.tone]} ${i.tone === 'ok' ? 'shadow-[0_0_8px_currentColor] text-emerald-400' : ''}`} aria-hidden="true" />
          <span className="uppercase tracking-[0.1em] text-[10.5px] text-fg-faint">{i.label}</span>
          <span className="text-fg-muted">{i.value}</span>
        </li>
      ))}
    </ul>
  )
}

// Floating information panels for very wide screens, placed only in the empty
// space beside the hero content. The market panel shows the real BTC price
// from the same feed as the hero, or "Unavailable"; the portfolio panel
// describes the product. Neither shows client activity or performance.
export function HeroFloatPanels({ price, change, live }: { price?: number; change?: number; live: boolean }) {
  const { t } = useI18n()
  return (
    <div className="hidden min-[1760px]:block pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute left-8 top-[20%] w-52 rounded-xl border border-ink-700/80 bg-ink-900/55 backdrop-blur-md px-4 py-3 shadow-[0_20px_40px_-24px_rgb(0_0_0/.6)] float-a">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-accent/90">{t('landing.status.panelMarket')}</p>
        <p className="mt-1 text-[13px] font-medium text-fg">BTC/USD</p>
        {live && price ? (
          <p className="text-[15px] font-semibold tabular-nums text-fg">${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {change !== undefined && <span className={`ml-2 text-[11.5px] ${change >= 0 ? 'price-up' : 'price-down'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>}</p>
        ) : <p className="text-[11.5px] text-fg-faint">{t('landing.status.unavailable')}</p>}
      </div>
      <div className="absolute right-8 bottom-[16%] w-52 rounded-xl border border-ink-700/80 bg-ink-900/55 backdrop-blur-md px-4 py-3 shadow-[0_20px_40px_-24px_rgb(0_0_0/.6)] float-b">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-accent/90">{t('landing.status.panelPortfolio')}</p>
        <p className="mt-1 text-[12.5px] text-fg-muted leading-snug">{t('landing.status.trackHoldings')}</p>
      </div>
    </div>
  )
}

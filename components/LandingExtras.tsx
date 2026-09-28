'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { compactUsd, timeAgo, useBtcHistory, useBtcSummary, type SummaryStatus } from '@/components/useMarket'

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
  const map = {
    live: { t: 'Live', c: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]', d: 'bg-emerald-400', pulse: true },
    stale: { t: 'Delayed', c: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.06]', d: 'bg-amber-400', pulse: false },
    loading: { t: 'Connecting', c: 'text-fg-muted border-ink-600', d: 'bg-fg-faint', pulse: false },
    error: { t: 'Offline', c: 'text-red-400 border-red-500/30 bg-red-500/[0.06]', d: 'bg-red-400', pulse: false },
  }[status]
  return (
    <span className={`tag ${map.c}`}>
      <span className="relative flex w-1.5 h-1.5">
        {map.pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${map.d} opacity-70 animate-ping`} />}
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

function PriceHistory() {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30')
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const market = useBtcSummary()
  const hist = useBtcHistory(range)
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
  const color = up ? '#34D399' : '#F87171'
  const longRange = range === '365' || range === '1825'
  const s = market.summary
  const headlinePrice = hovered ? hovered.p : s?.price ?? geo?.last
  const source = s?.source ?? hist.history?.source

  const stats: [string, string | null][] = [
    ['24h change', s ? `${s.change24h >= 0 ? '+' : '-'}${Math.abs(s.change24h).toFixed(2)}%` : null],
    ['24h high', s ? usd(s.high24h) : null],
    ['24h low', s ? usd(s.low24h) : null],
    ['24h volume', s ? compactUsd(s.volume24hUsd) : null],
  ]

  return (
    <div className="panel panel-lift overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[13px] text-fg-faint">
              <span>{hovered ? `Price on ${new Date(hovered.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(longRange ? {} : { hour: '2-digit', minute: '2-digit' }) })}` : 'BTC / USD'}</span>
              {!hovered && <MarketStatusPill status={market.status} />}
            </div>
            <div className="text-[32px] sm:text-4xl font-semibold text-fg tabular-nums mt-1.5 leading-none tracking-tight">
              {headlinePrice !== undefined ? usd(headlinePrice) : <span className="skeleton inline-block w-52 h-9 align-middle" />}
            </div>
            <div className="h-5 mt-2 text-sm tabular-nums">
              {geo && (
                <span className={up ? 'price-up' : 'price-down'}>
                  {up ? '+' : '-'}{Math.abs(change).toFixed(2)}% <span className="text-fg-faint">over {RANGES.find(r => r.id === range)!.label}</span>
                </span>
              )}
            </div>
          </div>
          <div className="seg" role="tablist" aria-label="Chart range">
            {RANGES.map(r => (
              <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => { setRange(r.id); setHover(null) }}
                className={`seg-btn ${range === r.id ? 'seg-btn-on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px mt-5 bg-ink-700 border border-ink-700 rounded-md overflow-hidden">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-ink-900/90 px-3.5 py-2.5">
              <dt className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</dt>
              <dd className={`text-sm font-medium tabular-nums mt-0.5 ${label === '24h change' && s ? (s.change24h >= 0 ? 'price-up' : 'price-down') : 'text-fg'}`}>
                {value ?? (market.status === 'error' ? <span className="text-fg-faint">Unavailable</span> : <span className="skeleton inline-block w-16 h-4 align-middle" />)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative px-2 sm:px-3">
        {hist.status === 'error' && !geo ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-fg-muted">We couldn&apos;t load the {RANGES.find(r => r.id === range)!.label} price history.</p>
            <p className="text-xs text-fg-faint max-w-xs">The market data provider didn&apos;t respond. This doesn&apos;t affect your account.</p>
            <button onClick={hist.retry} className="btn btn-sm btn-outline mt-1">Try again</button>
          </div>
        ) : !geo ? (
          <div className="h-[260px] px-2 flex flex-col justify-end gap-2 pb-2" aria-label="Loading price history">
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
            aria-label={`Bitcoin price over ${RANGES.find(r => r.id === range)!.label}`}
          >
            <defs>
              <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#232931" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path d={`${geo.line} L${w},${h} L0,${h} Z`} fill="url(#phFill)" />
            <path d={geo.line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" className="chart-draw" key={range} />
            {hovered && (
              <>
                <line x1={hovered.x} x2={hovered.x} y1="0" y2={h} stroke="#6B7480" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <circle cx={hovered.x} cy={hovered.y} r="4" fill={color} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 sm:px-6 py-3 border-t border-ink-700 text-[11px] text-fg-faint">
        <span>
          {geo ? <>Low {usd(geo.min, 0)} · High {usd(geo.max, 0)}</> : ' '}
          {market.fetchedAt && <> · Updated {timeAgo(market.fetchedAt)}</>}
          {market.status === 'stale' && <> · <button onClick={market.retry} className="underline underline-offset-2 hover:text-fg">Refresh</button></>}
        </span>
        {source && <span>Market data provided by {source}</span>}
      </div>
    </div>
  )
}

/* BTC <-> USD converter using the live price */
function Converter({ price }: { price?: number }) {
  const [usdVal, setUsdVal] = useState('1000')
  const [btcVal, setBtcVal] = useState('')
  const [last, setLast] = useState<'usd' | 'btc'>('usd')

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
      <h3 className="text-[15px] font-semibold text-fg">Bitcoin calculator</h3>
      <p className="text-[13px] text-fg-faint mt-1 mb-5">Converts at the live price. Type in either box.</p>
      <div className="space-y-3">
        <div>
          <label htmlFor="conv-usd" className="field-label">US dollars</label>
          <input id="conv-usd" type="number" inputMode="decimal" min="0" value={usdVal} onChange={e => { setLast('usd'); setUsdVal(e.target.value) }} className="field tabular-nums" />
        </div>
        <div>
          <label htmlFor="conv-btc" className="field-label">Bitcoin (BTC)</label>
          <input id="conv-btc" type="number" inputMode="decimal" min="0" value={btcVal} onChange={e => { setLast('btc'); setBtcVal(e.target.value) }} className="field tabular-nums" placeholder={price ? '' : 'Waiting for price'} />
        </div>
      </div>
      <div className="mt-auto pt-5 text-[13px] text-fg-muted tabular-nums">
        {price ? <>1 BTC = {usd(price)}<br />$1 = {(1 / price).toFixed(8)} BTC ({Math.round(1e8 / price).toLocaleString()} sats)</> : 'Live price unavailable'}
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

function FactCard({ title, children, source }: { title: string; children: ReactNode; source: string }) {
  return (
    <div className="panel p-5 sm:p-6 flex flex-col h-full">
      <h3 className="text-[15px] font-semibold text-fg mb-4">{title}</h3>
      <div className="flex-1">{children}</div>
      <p className="text-[11px] text-fg-faint mt-4">{source}</p>
    </div>
  )
}

const Unavailable = () => <p className="text-sm text-fg-faint">Unavailable right now.</p>
const Loading = () => <div className="space-y-2"><div className="skeleton h-8 w-40" /><div className="skeleton h-4 w-full" /></div>

function NetworkFacts() {
  const { f, loaded } = useFacts()
  const HALVING = 210_000
  const h = f.height
  const nextHalving = h !== undefined ? Math.ceil((h + 1) / HALVING) * HALVING : undefined
  const blocksLeft = h !== undefined && nextHalving ? nextHalving - h : undefined
  const epochProgress = h !== undefined ? ((h % HALVING) / HALVING) * 100 : 0
  const reward = h !== undefined ? 50 / 2 ** Math.floor(h / HALVING) : undefined
  const eta = blocksLeft ? new Date(Date.now() + blocksLeft * 10 * 60_000) : undefined

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Reveal className="h-full">
        <FactCard title="Next halving" source="Estimated from the current block height, assuming 10-minute blocks.">
          {!loaded.chain ? <Loading /> : blocksLeft === undefined ? <Unavailable /> : (
            <>
              <div className="text-3xl font-semibold text-fg tabular-nums">{blocksLeft.toLocaleString()}</div>
              <div className="text-[13px] text-fg-muted mb-4">blocks to go, around {eta!.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
              <Bar value={epochProgress} />
              <div className="flex justify-between text-xs text-fg-faint mt-2 tabular-nums">
                <span>Block {h!.toLocaleString()}</span><span>{nextHalving!.toLocaleString()}</span>
              </div>
              <p className="text-[13px] text-fg-muted mt-4">Miners earn {reward} BTC per block now. After the halving it drops to {reward! / 2} BTC.</p>
            </>
          )}
        </FactCard>
      </Reveal>

      <Reveal delay={80} className="h-full">
        <FactCard title="Bitcoin supply" source="The 21 million limit is set by the Bitcoin protocol. Market data provided by CoinGecko.">
          {!loaded.supply ? <Loading /> : !f.circulating ? <Unavailable /> : (
            <>
              <div className="text-3xl font-semibold text-fg tabular-nums">{(f.circulating / 1e6).toFixed(2)}M</div>
              <div className="text-[13px] text-fg-muted mb-4">of 21M BTC already mined ({((f.circulating / 21e6) * 100).toFixed(2)}%)</div>
              <Bar value={(f.circulating / 21e6) * 100} />
              <p className="text-[13px] text-fg-muted mt-4">About {((21e6 - f.circulating) / 1e6).toFixed(2)}M BTC are left to be mined, gradually, until around the year 2140.</p>
            </>
          )}
        </FactCard>
      </Reveal>

      <Reveal delay={160} className="h-full">
        <FactCard title="All-time high" source="Market data provided by CoinGecko.">
          {!loaded.supply ? <Loading /> : !f.ath ? <Unavailable /> : (
            <>
              <div className="text-3xl font-semibold text-fg tabular-nums">{usd(f.ath, 0)}</div>
              <div className="text-[13px] text-fg-muted mb-4">reached {f.athDate ? new Date(f.athDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'on an unknown date'}</div>
              {f.athChange !== undefined && (
                <p className="text-[13px] text-fg-muted">
                  Today&apos;s price is <span className={f.athChange >= 0 ? 'price-up' : 'price-down'}>{Math.abs(f.athChange).toFixed(1)}% {f.athChange >= 0 ? 'above' : 'below'}</span> that peak. Past highs do not predict future prices.
                </p>
              )}
            </>
          )}
        </FactCard>
      </Reveal>

      <Reveal delay={240} className="h-full">
        <FactCard title="Network activity" source="Refreshes every minute.">
          {!loaded.chain ? <Loading /> : f.mempoolCount === undefined && f.diffProgress === undefined ? <Unavailable /> : (
            <dl className="space-y-4">
              {f.mempoolCount !== undefined && (
                <div>
                  <dt className="text-[13px] text-fg-faint">Transactions waiting to confirm</dt>
                  <dd className="text-2xl font-semibold text-fg tabular-nums">{f.mempoolCount.toLocaleString()}</dd>
                  {f.mempoolVsize !== undefined && <dd className="text-xs text-fg-faint">about {Math.max(1, Math.round(f.mempoolVsize / 1e6))} blocks worth</dd>}
                </div>
              )}
              {f.diffProgress !== undefined && (
                <div>
                  <dt className="text-[13px] text-fg-faint mb-2">Next difficulty adjustment</dt>
                  <dd><Bar value={f.diffProgress} /></dd>
                  <dd className="text-xs text-fg-muted mt-2 tabular-nums">
                    {f.diffRemaining?.toLocaleString()} blocks left
                    {f.diffChange !== undefined && <>, estimated {f.diffChange >= 0 ? '+' : ''}{f.diffChange.toFixed(2)}%</>}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </FactCard>
      </Reveal>
    </div>
  )
}

/* FAQ */
const FAQ: { q: string; a: string }[] = [
  { q: 'How long does a deposit take to show in my balance?', a: 'First the Bitcoin network has to confirm your transfer. A new block is added about every 10 minutes on average, and busy periods can take longer. After that, our team checks your receipt and the transfer. Your balance updates the moment it is approved, and you can follow the status in your dashboard.' },
  { q: 'Why is my deposit showing as pending?', a: 'Every deposit is reviewed by a person before it is credited. Pending means we have your submission and it has not been approved yet. Uploading a clear receipt and the transaction ID helps us match it faster.' },
  { q: 'How do I withdraw?', a: 'Open Withdraw in your dashboard, choose whether to withdraw from your available balance or your profit balance, enter the amount and your Bitcoin address, and submit. Nothing is deducted until the request is approved. If it is declined, your balance stays the same.' },
  { q: 'What is the profit balance?', a: 'It is a separate balance where any profit credited to your account is shown. It is kept apart from the money you deposited so you can see each clearly, and you can request a withdrawal from it on its own.' },
  { q: 'Can I lose money?', a: 'Yes. The price of Bitcoin can fall sharply and quickly. We do not promise returns, and past prices do not predict future ones. Only deposit money you can afford to lose.' },
  { q: 'Who can see my account?', a: 'Only you and our review team. The database only lets a signed-in client read their own balances and transactions, and receipts you upload are stored privately.' },
]

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
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
              {item.q}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`shrink-0 text-fg-faint transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-10 text-[15px] text-fg-muted leading-relaxed">{item.a}</p>
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
  return (
    <section className="border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <Reveal><SectionHead title="Price history" body="See how the price has moved over the past week, month, year or five years, and convert between dollars and Bitcoin at today's price." /></Reveal>
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Reveal><PriceHistory /></Reveal>
          <Reveal delay={100} className="h-full"><Converter price={price} /></Reveal>
        </div>
      </div>
    </section>
  )
}

export function NetworkSection() {
  return (
    <section className="border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <Reveal><SectionHead title="The Bitcoin network right now" body="Live figures from the Bitcoin blockchain: how many coins exist, when the next halving is due, and how busy the network is." /></Reveal>
        <NetworkFacts />
      </div>
    </section>
  )
}

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-16 border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-[1fr_1.6fr] gap-10">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-fg">Common questions</h2>
          <p className="mt-3 text-fg-muted">Straight answers about deposits, withdrawals and risk.</p>
        </Reveal>
        <Reveal delay={100}><FaqList /></Reveal>
      </div>
    </section>
  )
}

/* Trust bar: every claim here is true and checkable — no invented activity,
   no promised returns. Legitimacy comes from verifiability, not from
   claiming automation that doesn't exist. */
export function TrustBar({ marketStatus }: { marketStatus?: 'connecting' | 'live' | 'polling' | 'error' }) {
  const liveFeed = marketStatus === 'live' || marketStatus === 'polling'
  const items: { label: string; sub: string }[] = [
    { label: liveFeed ? 'Live market data' : 'Market data', sub: liveFeed ? 'Streaming now' : 'Refreshing' },
    { label: 'Manual review', sub: 'Every deposit checked' },
    { label: 'Full audit trail', sub: 'Every balance change logged' },
    { label: 'Secure access', sub: 'Encrypted sign-in' },
  ]
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 py-5 border-y border-ink-700">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full ${liveFeed ? 'bg-emerald-400 animate-ping opacity-60' : 'bg-fg-faint'}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${liveFeed ? 'bg-emerald-400' : 'bg-fg-faint'}`} />
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

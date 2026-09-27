'use client'

import { useEffect, useRef, useState } from 'react'

type Product = 'BTC-USD' | 'ETH-USD' | 'SOL-USD'
const PRODUCTS: Product[] = ['BTC-USD', 'ETH-USD', 'SOL-USD']
const LABELS: Record<Product, string> = {
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
  'SOL-USD': 'Solana',
}

export interface Quote { price: number; open24h: number; dir: 'up' | 'down' | null }
export interface Trade { id: number; price: number; size: number; side: 'buy' | 'sell'; time: string }
type Status = 'connecting' | 'live' | 'polling' | 'error'

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

// Streams real prices and trades from Coinbase's public feed; falls back to
// CoinGecko polling if the socket can't connect.
export function useLiveMarket() {
  const [quotes, setQuotes] = useState<Partial<Record<Product, Quote>>>({})
  const [trades, setTrades] = useState<Trade[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const pendingQuotes = useRef<Partial<Record<Product, { price: number; open24h: number }>>>({})
  const pendingTrades = useRef<Trade[]>([])

  useEffect(() => {
    let ws: WebSocket | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let closed = false

    const flush = setInterval(() => {
      const q = pendingQuotes.current
      if (Object.keys(q).length) {
        pendingQuotes.current = {}
        setQuotes(prev => {
          const next = { ...prev }
          for (const p of Object.keys(q) as Product[]) {
            const old = prev[p]?.price
            const { price, open24h } = q[p]!
            next[p] = { price, open24h, dir: old == null || old === price ? prev[p]?.dir ?? null : price > old ? 'up' : 'down' }
          }
          return next
        })
      }
      if (pendingTrades.current.length) {
        const batch = pendingTrades.current
        pendingTrades.current = []
        setTrades(prev => [...batch.reverse(), ...prev].slice(0, 9))
      }
    }, 600)

    const startPolling = () => {
      if (pollTimer || closed) return
      const poll = async () => {
        try {
          const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true')
          if (!res.ok) throw new Error()
          const j = await res.json()
          const map: [Product, string][] = [['BTC-USD', 'bitcoin'], ['ETH-USD', 'ethereum'], ['SOL-USD', 'solana']]
          for (const [p, id] of map) {
            const price = j[id]?.usd
            const ch = j[id]?.usd_24h_change
            if (price) pendingQuotes.current[p] = { price, open24h: price / (1 + (ch ?? 0) / 100) }
          }
          setStatus('polling')
        } catch {
          setStatus(s => (s === 'polling' ? s : 'error'))
        }
      }
      poll()
      pollTimer = setInterval(poll, 30_000)
    }

    try {
      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      const failTimer = setTimeout(() => { if (ws?.readyState !== WebSocket.OPEN) startPolling() }, 6000)
      ws.onopen = () => {
        clearTimeout(failTimer)
        ws!.send(JSON.stringify({
          type: 'subscribe',
          product_ids: PRODUCTS,
          channels: ['ticker', { name: 'matches', product_ids: ['BTC-USD'] }],
        }))
      }
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.type === 'ticker' && m.price) {
          pendingQuotes.current[m.product_id as Product] = { price: +m.price, open24h: +m.open_24h }
          setStatus('live')
        } else if (m.type === 'match' && m.product_id === 'BTC-USD') {
          pendingTrades.current.push({ id: m.trade_id, price: +m.price, size: +m.size, side: m.side === 'buy' ? 'sell' : 'buy', time: m.time })
          if (pendingTrades.current.length > 20) pendingTrades.current.splice(0, pendingTrades.current.length - 20)
        }
      }
      ws.onerror = () => startPolling()
      ws.onclose = () => { if (!closed) startPolling() }
    } catch {
      startPolling()
    }

    return () => {
      closed = true
      clearInterval(flush)
      if (pollTimer) clearInterval(pollTimer)
      ws?.close()
    }
  }, [])

  return { quotes, trades, status }
}


function pctChange(q?: Quote) {
  if (!q || !q.open24h) return null
  return ((q.price - q.open24h) / q.open24h) * 100
}

function Change({ value, className = '' }: { value: number | null; className?: string }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <span className={`tabular-nums font-medium ${up ? 'price-up' : 'price-down'} ${className}`}>
      {up ? '+' : '-'}{Math.abs(value).toFixed(2)}%
    </span>
  )
}

// Colors the price briefly when a new trade moves it, then settles back.
function TickPrice({ quote, className = '' }: { quote?: Quote; className?: string }) {
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  const last = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!quote) return
    const prev = last.current
    last.current = quote.price
    if (prev === undefined || prev === quote.price) return
    setDir(quote.price > prev ? 'up' : 'down')
    const t = setTimeout(() => setDir(null), 900)
    return () => clearTimeout(t)
  }, [quote])
  if (!quote) return <span className={`inline-block skeleton h-[0.9em] w-44 align-middle ${className}`} />
  return <span className={`tabular-nums price-tick ${dir === 'up' ? 'price-up' : dir === 'down' ? 'price-down' : ''} ${className}`}>{usd(quote.price)}</span>
}

export function LiveTickerBar({ quotes }: { quotes: Partial<Record<Product, Quote>> }) {
  const items = PRODUCTS.map(p => {
    const q = quotes[p]
    return (
      <div key={p} className="flex items-center gap-3 px-8 shrink-0 text-[13px]">
        <span className="text-fg-muted">{LABELS[p]}</span>
        <span className="text-fg-faint">{p.replace('-USD', '')}</span>
        {q ? <span className="text-fg font-medium tabular-nums">{usd(q.price)}</span> : <span className="skeleton inline-block w-20 h-3" />}
        <Change value={pctChange(q)} />
      </div>
    )
  })
  return (
    <div className="relative overflow-hidden border-b border-ink-700 bg-ink-900 h-10 flex items-center marquee-mask" aria-label="Live prices">
      <div className="flex w-max animate-marquee">
        {items}{items}{items}{items}
      </div>
    </div>
  )
}

function useBtcHistory() {
  const [points, setPoints] = useState<number[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1')
        if (!res.ok) throw new Error()
        const j = await res.json()
        if (alive) setPoints((j.prices as [number, number][]).map(([, p]) => p))
      } catch { if (alive) setPoints(prev => prev ?? []) }
    }
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return points
}

function LineChart({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 400, h = 120
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / span) * (h - 12) - 6])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = positive ? '#34D399' : '#F87171'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label="Bitcoin price, last 24 hours">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} fillOpacity="0.07" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function HeroLivePanel({ quotes, trades, status }: ReturnType<typeof useLiveMarket>) {
  const btc = quotes['BTC-USD']
  const ch = pctChange(btc)
  const history = useBtcHistory()
  const series = history && history.length > 1 ? (btc ? [...history, btc.price] : history) : null

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-fg-muted">Bitcoin <span className="text-fg-faint">BTC/USD</span></div>
        <StatusTag status={status} />
      </div>

      <TickPrice quote={btc} className="block text-[40px] sm:text-[44px] leading-none font-semibold tracking-tight text-fg" />
      <div className="mt-2 h-5 text-sm">
        {ch !== null && <><Change value={ch} /> <span className="text-fg-faint">past 24h</span></>}
      </div>

      <div className="mt-4 mb-5 -mx-1">
        {series ? <LineChart points={series} positive={(ch ?? 0) >= 0} /> : history === null ? <div className="skeleton h-28" /> : <div className="h-28 flex items-center justify-center text-xs text-fg-faint">24h chart unavailable right now</div>}
      </div>

      <div className="border-t border-ink-700 pt-4">
        <div className="grid grid-cols-3 text-[11px] uppercase tracking-wide text-fg-faint mb-2">
          <span>Price (USD)</span><span className="text-right">Size (BTC)</span><span className="text-right">Time</span>
        </div>
        <div className="h-[176px] overflow-hidden">
          {trades.length === 0 && (
            <div className="text-xs text-fg-faint pt-8 text-center">
              {status === 'polling' || status === 'error' ? 'Trade feed unavailable. Prices update every 30 seconds.' : 'Waiting for trades'}
            </div>
          )}
          {trades.slice(0, 8).map(t => (
            <div key={t.id} className="row-in grid grid-cols-3 text-[13px] tabular-nums h-[22px] items-center">
              <span className={t.side === 'buy' ? 'price-up' : 'price-down'}>{usd(t.price)}</span>
              <span className="text-right text-fg-muted">{t.size.toFixed(5)}</span>
              <span className="text-right text-fg-faint">{new Date(t.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-fg-faint mt-3">Live market prices and trade activity.</p>
    </div>
  )
}

function StatusTag({ status }: { status: Status }) {
  const map = {
    live: { t: 'Live', c: 'text-emerald-400 border-emerald-500/30', d: 'bg-emerald-400' },
    polling: { t: 'Delayed', c: 'text-amber-400 border-amber-500/30', d: 'bg-amber-400' },
    connecting: { t: 'Connecting', c: 'text-fg-muted border-ink-600', d: 'bg-fg-faint' },
    error: { t: 'Offline', c: 'text-red-400 border-red-500/30', d: 'bg-red-400' },
  }[status]
  return (
    <span className={`tag ${map.c}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${map.d}`} />
      {map.t}
    </span>
  )
}

interface Block { id: string; height: number; timestamp: number; tx_count: number; size: number; extras?: { pool?: { name?: string } } }

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
}

export function LatestBlocks() {
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [fees, setFees] = useState<{ fastestFee: number; halfHourFee: number; hourFee: number } | null>(null)
  const [error, setError] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [, tick] = useState(0)
  const topId = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [bRes, fRes] = await Promise.all([
          fetch('https://mempool.space/api/v1/blocks'),
          fetch('https://mempool.space/api/v1/fees/recommended'),
        ])
        if (!bRes.ok) throw new Error()
        const b: Block[] = (await bRes.json()).slice(0, 6)
        if (!alive) return
        if (topId.current && b[0]?.id !== topId.current) setFresh(b[0].id)
        topId.current = b[0]?.id ?? null
        setBlocks(b)
        if (fRes.ok) setFees(await fRes.json())
        setError(false)
      } catch { if (alive) setError(true) }
    }
    load()
    const poll = setInterval(load, 30_000)
    const clock = setInterval(() => tick(n => n + 1), 1000)
    return () => { alive = false; clearInterval(poll); clearInterval(clock) }
  }, [])

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">Latest Bitcoin blocks</h3>
          <p className="text-[13px] text-fg-faint mt-1">New blocks are added here as they are mined. Checked every 30 seconds.</p>
        </div>
        {fees && (
          <dl className="flex gap-5 text-[13px]">
            {([['Next block', fees.fastestFee], ['~30 min', fees.halfHourFee], ['~1 hour', fees.hourFee]] as const).map(([l, v]) => (
              <div key={l}>
                <dt className="text-fg-faint">{l}</dt>
                <dd className="text-fg font-medium tabular-nums">{v} sat/vB</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {error && !blocks && <p className="text-sm text-red-400">Block data is unavailable right now.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {!blocks && !error && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[118px]" />)}
        {blocks?.map(b => (
          <div key={b.id} className={`rounded-md border border-ink-700 bg-ink-850 p-3 ${fresh === b.id ? 'block-new' : ''}`}>
            <div className="text-[15px] font-semibold text-fg tabular-nums">{b.height.toLocaleString()}</div>
            <div className="text-xs text-fg-faint mb-3">{timeAgo(b.timestamp)}</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{b.tx_count.toLocaleString()} transactions</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{(b.size / 1e6).toFixed(2)} MB</div>
            <div className="text-xs text-fg-faint truncate mt-1">{b.extras?.pool?.name ?? 'Unknown pool'}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-fg-faint mt-4">Updated continuously from the Bitcoin network.</p>
    </div>
  )
}

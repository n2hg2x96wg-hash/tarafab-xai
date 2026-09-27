'use client'

import { useEffect, useRef, useState } from 'react'

type Product = 'BTC-USD' | 'ETH-USD' | 'SOL-USD'
const PRODUCTS: Product[] = ['BTC-USD', 'ETH-USD', 'SOL-USD']
const LABELS: Record<Product, { name: string; icon: string; color: string }> = {
  'BTC-USD': { name: 'Bitcoin', icon: '₿', color: 'from-orange-400 to-orange-600' },
  'ETH-USD': { name: 'Ethereum', icon: 'Ξ', color: 'from-indigo-400 to-violet-600' },
  'SOL-USD': { name: 'Solana', icon: '◎', color: 'from-emerald-400 to-fuchsia-500' },
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

function FlashPrice({ quote, className = '' }: { quote?: Quote; className?: string }) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const last = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!quote) return
    if (last.current !== undefined && last.current !== quote.price) {
      setFlash(quote.price > last.current ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 700)
      last.current = quote.price
      return () => clearTimeout(t)
    }
    last.current = quote.price
  }, [quote])
  if (!quote) return <span className={`inline-block skeleton h-[1em] w-40 align-middle ${className}`} />
  return (
    <span className={`tabular-nums transition-colors duration-300 ${flash === 'up' ? 'text-emerald-400 price-flash-up' : flash === 'down' ? 'text-red-400 price-flash-down' : ''} ${className}`}>
      {usd(quote.price)}
    </span>
  )
}

export function LiveTickerBar({ quotes }: { quotes: Partial<Record<Product, Quote>> }) {
  const items = PRODUCTS.map(p => {
    const q = quotes[p]
    const ch = pctChange(q)
    return (
      <div key={p} className="flex items-center gap-2.5 px-6 shrink-0">
        <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${LABELS[p].color} flex items-center justify-center text-[10px] font-bold`}>{LABELS[p].icon}</span>
        <span className="text-slate-400 text-xs font-medium">{p.replace('-', '/')}</span>
        <span className="text-white text-xs font-semibold tabular-nums">{q ? usd(q.price) : '—'}</span>
        {ch !== null && (
          <span className={`text-[11px] font-semibold tabular-nums ${ch >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%
          </span>
        )}
      </div>
    )
  })
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-black/30 backdrop-blur-sm py-2.5 marquee-mask">
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
      } catch { if (alive) setPoints([]) }
    }
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return points
}

function AreaChart({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 400, h = 120
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / span) * (h - 10) - 5])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = positive ? '#10b981' : '#ef4444'
  const [lx, ly] = xy[xy.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#heroArea)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" className="draw-line" />
      <circle cx={lx} cy={ly} r="4" fill={color} className="animate-ping-slow" />
      <circle cx={lx} cy={ly} r="3" fill={color} />
    </svg>
  )
}

export function HeroLivePanel({ quotes, trades, status }: ReturnType<typeof useLiveMarket>) {
  const btc = quotes['BTC-USD']
  const ch = pctChange(btc)
  const history = useBtcHistory()
  const series = history && history.length > 1 ? (btc ? [...history, btc.price] : history) : null

  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 bg-gradient-to-br from-violet-600/30 via-fuchsia-500/10 to-orange-500/20 blur-3xl rounded-[3rem] animate-aurora" />
      <div className="relative glass rounded-3xl p-5 sm:p-6 border border-white/10 shadow-[0_20px_80px_rgba(124,58,237,0.25)] overflow-hidden">
        <div aria-hidden className="absolute inset-0 shine-sweep pointer-events-none" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="coin-3d w-11 h-11 rounded-full bg-gradient-to-br from-amber-300 via-orange-500 to-orange-700 flex items-center justify-center text-xl font-black text-white shadow-[0_0_30px_rgba(251,146,60,0.55)]">₿</div>
            <div className="text-left">
              <div className="text-white font-semibold leading-tight">Bitcoin</div>
              <div className="text-slate-500 text-xs">BTC / USD</div>
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="text-left mb-1">
          <FlashPrice quote={btc} className="text-4xl sm:text-5xl font-black tracking-tight text-white" />
        </div>
        <div className="text-left text-sm mb-4 h-5">
          {ch !== null && (
            <span className={`font-semibold ${ch >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}% <span className="text-slate-500 font-normal">24h</span>
            </span>
          )}
        </div>

        <div className="-mx-2 mb-4">
          {series ? <AreaChart points={series} positive={(ch ?? 0) >= 0} /> : history === null ? <div className="skeleton h-28 rounded-xl" /> : <div className="h-28 flex items-center justify-center text-xs text-slate-500">24h chart unavailable</div>}
        </div>

        <div className="text-left">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500 mb-2">
            <span>Live trades</span><span>Size (BTC)</span>
          </div>
          <div className="space-y-1 h-[168px] overflow-hidden">
            {trades.length === 0 && <div className="text-xs text-slate-500 pt-6 text-center">{status === 'polling' || status === 'error' ? 'Live trade stream unavailable' : 'Waiting for trades…'}</div>}
            {trades.slice(0, 8).map(t => (
              <div key={t.id} className="trade-row flex items-center justify-between text-xs tabular-nums py-0.5">
                <span className={`font-semibold ${t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.side === 'buy' ? '▲' : '▼'} {usd(t.price)}
                </span>
                <span className="text-slate-400">{t.size.toFixed(5)}</span>
                <span className="text-slate-600 w-16 text-right whitespace-nowrap">{new Date(t.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-slate-600 mt-3 text-left">Prices &amp; trades streamed from Coinbase Exchange · 24h chart via CoinGecko</p>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: Status }) {
  const map = {
    live: { t: 'LIVE', c: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', d: 'bg-emerald-400' },
    polling: { t: 'DELAYED', c: 'bg-amber-500/15 text-amber-400 border-amber-500/30', d: 'bg-amber-400' },
    connecting: { t: 'CONNECTING', c: 'bg-slate-500/15 text-slate-400 border-slate-500/30', d: 'bg-slate-400' },
    error: { t: 'OFFLINE', c: 'bg-red-500/15 text-red-400 border-red-500/30', d: 'bg-red-400' },
  }[status]
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-wider ${map.c}`}>
      <span className="relative flex w-1.5 h-1.5">
        {status === 'live' && <span className={`absolute inline-flex h-full w-full rounded-full ${map.d} opacity-75 animate-ping`} />}
        <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${map.d}`} />
      </span>
      {map.t}
    </span>
  )
}

interface Block { id: string; height: number; timestamp: number; tx_count: number; size: number; extras?: { pool?: { name?: string } } }

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
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
    <div className="glass rounded-2xl p-5 sm:p-6 border border-white/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <span className="relative flex w-2 h-2"><span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full w-2 h-2 bg-orange-400" /></span>
            Latest Bitcoin blocks
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Newly mined blocks appear automatically</p>
        </div>
        {fees && (
          <div className="flex gap-2 text-[11px]">
            {[['Fast', fees.fastestFee], ['30 min', fees.halfHourFee], ['1 hr', fees.hourFee]].map(([l, v]) => (
              <div key={l} className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-center">
                <div className="text-slate-500">{l}</div>
                <div className="text-white font-semibold tabular-nums">{v} sat/vB</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && !blocks && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">Block data temporarily unavailable</div>}

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {!blocks && !error && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton shrink-0 w-36 h-36 rounded-xl" />)}
        {blocks?.map((b, i) => (
          <div
            key={b.id}
            className={`block-cube snap-start shrink-0 w-36 rounded-xl p-3 border text-left relative overflow-hidden ${i === 0 ? 'border-orange-500/40 bg-gradient-to-br from-orange-500/20 to-violet-600/10' : 'border-white/[0.07] bg-gradient-to-br from-violet-600/10 to-blue-600/5'} ${fresh === b.id ? 'block-new' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="text-orange-300 font-bold tabular-nums">#{b.height.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mb-3">{timeAgo(b.timestamp)}</div>
            <div className="text-xs text-slate-300 tabular-nums">{b.tx_count.toLocaleString()} txs</div>
            <div className="text-xs text-slate-400 tabular-nums">{(b.size / 1e6).toFixed(2)} MB</div>
            <div className="text-[11px] text-slate-500 truncate mt-1">{b.extras?.pool?.name ?? '—'}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-600 mt-3">Blockchain data via mempool.space · refreshes every 30s</p>
    </div>
  )
}

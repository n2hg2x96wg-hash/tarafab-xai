'use client'

import { chartColors } from '@/lib/chartColors'
import { useEffect, useRef, useState } from 'react'
import { sharedSummary, useBtcHistory } from '@/components/useMarket'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { AssetQuote } from '@/lib/assets'

type Product = 'BTC-USD'
const PRODUCTS: Product[] = ['BTC-USD']

export interface Quote { price: number; open24h: number; dir: 'up' | 'down' | null }
export interface Trade { id: number; price: number; size: number; side: 'buy' | 'sell'; time: string }
type Status = 'connecting' | 'live' | 'polling' | 'error'

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

// Streams real Bitcoin prices and trades from Coinbase's public feed; falls
// back to the shared server-side quote when the socket can't connect.
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

    // Bitcoin from our own server route: its provider timestamp says whether
    // the price is current. Used for the first price (before the stream opens)
    // and by the fallback feed if the stream cannot connect.
    const btcFromServer = async () => {
      // Shared with the other widgets on the page, so one page load makes one
      // summary request instead of one per widget.
      const j = await sharedSummary().catch(() => null)
      const x = j?.summary
      if (!x?.price || !(Date.now() - Date.parse(x.updatedAt) < 3 * 60_000)) return false
      pendingQuotes.current['BTC-USD'] = { price: x.price, open24h: x.price / (1 + (x.change24h ?? 0) / 100) }
      return true
    }
    btcFromServer().catch(() => false)

    const startPolling = () => {
      if (pollTimer || closed) return
      const poll = async () => {
        const btcOk = await btcFromServer().catch(() => false)
        if (!closed) setStatus(btcOk ? 'polling' : 'error')
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

type TickerRow = {
  asset: { symbol: string; name: string }
  quote: { price: number | null; change24h: number | null; status: 'live' | 'delayed' | 'unavailable' }
}

export function LiveTickerBar() {
  const { t } = useI18n()
  const [rows, setRows] = useState<TickerRow[]>([])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const refresh = async () => {
      let requestController: AbortController | undefined
      if (document.visibilityState === 'visible') {
        const activeController = new AbortController()
        requestController = activeController
        controller = activeController
        const timeout = setTimeout(() => activeController.abort(), 20_000)
        try {
          const response = await fetch('/api/market/assets', { cache: 'no-store', signal: activeController.signal })
          if (!response.ok) throw new Error('Market data unavailable')
          const body = await response.json() as { assets?: AssetQuote[] }
          // Only real, current quotes; stale or unavailable assets are left out.
          const usable: TickerRow[] = Array.isArray(body.assets) ? body.assets
            .filter(a => typeof a?.id === 'string' && typeof a?.name === 'string' &&
              a.price != null && Number.isFinite(a.price) && a.price > 0 && (a.state === 'live' || a.state === 'delayed'))
            .map(a => ({ asset: { symbol: a.id, name: a.name }, quote: { price: a.price, change24h: a.changePct, status: a.state as 'live' | 'delayed' } })) : []
          if (active && controller === requestController) {
            setRows(previous => {
              const unchanged = previous.length === usable.length && previous.every((row, index) => {
                const next = usable[index]
                return row.asset.symbol === next?.asset.symbol &&
                  row.asset.name === next?.asset.name &&
                  row.quote.price === next?.quote.price &&
                  row.quote.change24h === next?.quote.change24h &&
                  row.quote.status === next?.quote.status
              })
              return unchanged ? previous : usable
            })
          }
        } catch {
          if (active && controller === activeController) setRows([])
        } finally {
          clearTimeout(timeout)
        }
      }
      if (active && (!requestController || controller === requestController)) timer = setTimeout(refresh, 30_000)
    }
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer)
        controller?.abort()
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const renderItems = (copy: number) => rows.map(({ asset, quote }) => (
    <div key={`${copy}-${asset.symbol}`} className="flex items-center gap-2 sm:gap-3 px-5 sm:px-8 shrink-0 text-[12px] sm:text-[13px]">
      <span className="text-fg-muted">{asset.name}</span>
      <span className="text-fg-faint">{asset.symbol}</span>
      <span className="min-w-[5.5rem] text-right text-fg font-medium tabular-nums">{usd(quote.price!)}</span>
      <Change value={quote.change24h} />
      <span className={`text-[10px] uppercase tracking-wide ${quote.status === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
        {quote.status === 'live' ? t('status.live') : t('status.delayed')}
      </span>
    </div>
  ))

  return (
    <div className="relative overflow-hidden border-b border-ink-700 bg-ink-900 h-10 flex items-center marquee-mask" aria-label={t('market.livePrices')}>
      <div className={`flex w-max ${rows.length > 1 ? 'animate-marquee' : ''}`}>
        {rows.length ? <>{renderItems(0)}<div className="flex" aria-hidden="true">{renderItems(1)}</div></> : null}
      </div>
    </div>
  )
}

// 24h history for the hero chart, via the shared cached market route.
function useDayHistory() {
  const h = useBtcHistory('1')
  const points = h.history ? h.history.points.map(([, p]) => p) : null
  return { points, status: h.status, retry: h.retry }
}

function LineChart({ points, positive }: { points: number[]; positive: boolean }) {
  const { t } = useI18n()
  const w = 400, h = 120
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / span) * (h - 12) - 6])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = positive ? chartColors.up : chartColors.down
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label={t('market.chart24hAria')}>
      <path d={`${line} L${w},${h} L0,${h} Z`} style={{ fill: color, fillOpacity: 0.07 }} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function HeroLivePanel({ quotes, trades, status }: ReturnType<typeof useLiveMarket>) {
  const btc = quotes['BTC-USD']
  const ch = pctChange(btc)
  const day = useDayHistory()
  const history = day.points
  const { t, intl: intlTime } = useI18n()
  const series = history && history.length > 1 ? (btc ? [...history, btc.price] : history) : null

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-fg-muted">Bitcoin <span className="text-fg-faint">BTC/USD</span></div>
        <StatusTag status={status} />
      </div>

      <TickPrice quote={btc} className="block text-[40px] sm:text-[44px] leading-none font-semibold tracking-tight text-fg" />
      <div className="mt-2 h-5 text-sm">
        {ch !== null && <><Change value={ch} /> <span className="text-fg-faint">{t('market.past24h')}</span></>}
      </div>

      <div className="mt-4 mb-5 -mx-1">
        {series ? <LineChart points={series} positive={(ch ?? 0) >= 0} /> : day.status === 'loading' ? <div className="skeleton h-28" /> : (
          <div className="h-28 flex flex-col items-center justify-center gap-2 text-xs text-fg-faint">
            {day.status === 'error' ? t('market.chart24hFailed') : t('common.unavailable')}
            <button onClick={day.retry} className="underline underline-offset-2 hover:text-fg">{t('common.tryAgain')}</button>
          </div>
        )}
      </div>

      <div className="border-t border-ink-700 pt-4">
        <div className="grid grid-cols-3 text-[11px] uppercase tracking-wide text-fg-faint mb-2">
          <span>{t('market.priceUsd')}</span><span className="text-right">{t('market.sizeBtc')}</span><span className="text-right">{t('market.time')}</span>
        </div>
        <div className="h-[176px] overflow-hidden">
          {trades.length === 0 && (
            <div className="text-xs text-fg-faint pt-8 text-center">
              {status === 'polling' || status === 'error' ? t('market.tradesUnavailable') : t('market.waitingTrades')}
            </div>
          )}
          {trades.slice(0, 8).map(t => (
            <div key={t.id} className="row-in grid grid-cols-3 text-[13px] tabular-nums h-[22px] items-center">
              <span className={t.side === 'buy' ? 'price-up' : 'price-down'}>{usd(t.price)}</span>
              <span className="text-right text-fg-muted">{t.size.toFixed(5)}</span>
              <span className="text-right text-fg-faint">{new Date(t.time).toLocaleTimeString(intlTime, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusTag({ status }: { status: Status }) {
  const { t } = useI18n()
  const map = {
    live: { t: t('status.live'), c: 'text-emerald-400 border-emerald-500/30', d: 'bg-emerald-400' },
    // Fallback feed refreshed every 30 seconds: current, but not streaming.
    polling: { t: t('status.current'), c: 'text-emerald-400 border-emerald-500/30', d: 'bg-emerald-400' },
    connecting: { t: t('status.connecting'), c: 'text-fg-muted border-ink-600', d: 'bg-fg-faint' },
    error: { t: t('common.unavailable'), c: 'text-red-400 border-red-500/30', d: 'bg-red-400' },
  }[status]
  return (
    <span className={`tag ${map.c}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${map.d}`} />
      {map.t}
    </span>
  )
}

interface Block { id: string; height: number; timestamp: number; tx_count: number; size: number; extras?: { pool?: { name?: string } } }

function timeAgo(t: ReturnType<typeof useI18n>['t'], ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return t('common.secondsAgo', { n: s })
  if (s < 3600) return t('common.minutesAgo', { n: Math.floor(s / 60) })
  return t('common.hoursMinutesAgo', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) })
}

export function LatestBlocks() {
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [fees, setFees] = useState<{ fastestFee: number; halfHourFee: number; hourFee: number } | null>(null)
  const [error, setError] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [, tick] = useState(0)
  const topId = useRef<string | null>(null)
  const { t } = useI18n()

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
          <h3 className="text-[15px] font-semibold text-fg">{t('market.blocksTitle')}</h3>
          <p className="text-[13px] text-fg-faint mt-1">{t('market.blocksBody')}</p>
        </div>
        {fees && (
          <dl className="flex gap-5 text-[13px]">
            {([[t('market.nextBlock'), fees.fastestFee], [t('market.halfHour'), fees.halfHourFee], [t('market.oneHour'), fees.hourFee]] as const).map(([l, v]) => (
              <div key={l}>
                <dt className="text-fg-faint">{l}</dt>
                <dd className="text-fg font-medium tabular-nums">{v} sat/vB</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {error && !blocks && <p className="text-sm text-red-400">{t('market.blocksUnavailable')}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {!blocks && !error && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[118px]" />)}
        {blocks?.map(b => (
          <div key={b.id} className={`rounded-md border border-ink-700 bg-ink-850 p-3 ${fresh === b.id ? 'block-new' : ''}`}>
            <div className="text-[15px] font-semibold text-fg tabular-nums">{b.height.toLocaleString()}</div>
            <div className="text-xs text-fg-faint mb-3">{timeAgo(t, b.timestamp)}</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{t('market.transactions', { n: b.tx_count.toLocaleString() })}</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{(b.size / 1e6).toFixed(2)} MB</div>
            <div className="text-xs text-fg-faint truncate mt-1">{b.extras?.pool?.name ?? t('market.unknownPool')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

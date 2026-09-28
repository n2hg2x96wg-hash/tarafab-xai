// Server-side Bitcoin market data. Browsers call our own /api/market/* routes,
// which are CDN-cached, so every visitor shares one upstream request instead
// of each browser hitting the rate-limited public APIs directly.
//
// Primary source: Coinbase Exchange public market data (no key, multi-year
// daily candles). Fallback: CoinGecko public API (history capped at 365 days).

const COINBASE = process.env.MARKET_COINBASE_BASE || 'https://api.exchange.coinbase.com'
const COINGECKO = process.env.MARKET_COINGECKO_BASE || 'https://api.coingecko.com/api/v3'
const HEADERS = { 'User-Agent': 'tarafab-xai/1.0', Accept: 'application/json' }
const TIMEOUT_MS = 8000

export type MarketSource = 'Coinbase Exchange' | 'CoinGecko'

export interface MarketSummary {
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24hUsd: number
  updatedAt: string
  source: MarketSource
}

export interface MarketHistory {
  range: HistoryRange
  points: [number, number][]
  source: MarketSource
}

export const HISTORY_RANGES = ['1', '7', '30', '365', '1825'] as const
export type HistoryRange = (typeof HISTORY_RANGES)[number]

// How long each response may be reused. Longer ranges change more slowly.
export const HISTORY_TTL: Record<HistoryRange, number> = { '1': 60, '7': 300, '30': 900, '365': 3600, '1825': 21600 }
export const SUMMARY_TTL = 30

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate } })
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`)
  return res.json() as Promise<T>
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) throw new Error('Malformed market data')
  return n
}

/* ---------- summary ---------- */

async function coinbaseSummary(): Promise<MarketSummary> {
  const [stats, ticker] = await Promise.all([
    getJson<Record<string, string>>(`${COINBASE}/products/BTC-USD/stats`, SUMMARY_TTL),
    getJson<Record<string, string>>(`${COINBASE}/products/BTC-USD/ticker`, SUMMARY_TTL),
  ])
  const price = num(ticker.price ?? stats.last)
  const open = num(stats.open)
  return {
    price,
    change24h: open ? ((price - open) / open) * 100 : 0,
    high24h: num(stats.high),
    low24h: num(stats.low),
    volume24hUsd: num(stats.volume) * price,
    updatedAt: ticker.time || new Date().toISOString(),
    source: 'Coinbase Exchange',
  }
}

async function coingeckoSummary(): Promise<MarketSummary> {
  const [btc] = await getJson<Record<string, unknown>[]>(`${COINGECKO}/coins/markets?vs_currency=usd&ids=bitcoin`, SUMMARY_TTL)
  if (!btc) throw new Error('Malformed market data')
  return {
    price: num(btc.current_price),
    change24h: num(btc.price_change_percentage_24h ?? 0),
    high24h: num(btc.high_24h),
    low24h: num(btc.low_24h),
    volume24hUsd: num(btc.total_volume),
    updatedAt: String(btc.last_updated || new Date().toISOString()),
    source: 'CoinGecko',
  }
}

export async function getSummary(): Promise<MarketSummary> {
  try {
    return await coinbaseSummary()
  } catch (primary) {
    try {
      return await coingeckoSummary()
    } catch {
      throw primary
    }
  }
}

/* ---------- history ---------- */

// Candle size per range, chosen so each range is a readable 100-400 points.
const GRANULARITY: Record<HistoryRange, number> = { '1': 900, '7': 3600, '30': 21600, '365': 86400, '1825': 86400 }
const MAX_CANDLES = 300 // Coinbase limit per request

async function coinbaseHistory(range: HistoryRange): Promise<MarketHistory> {
  const g = GRANULARITY[range]
  const end = Math.floor(Date.now() / 1000)
  const start = end - Number(range) * 86400
  const windows: [number, number][] = []
  for (let s = start; s < end; s += g * MAX_CANDLES) windows.push([s, Math.min(end, s + g * MAX_CANDLES)])

  const pages = await Promise.all(windows.map(([s, e]) =>
    getJson<number[][]>(
      `${COINBASE}/products/BTC-USD/candles?granularity=${g}&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`,
      HISTORY_TTL[range],
    ),
  ))

  // Candle rows are [time, low, high, open, close, volume], newest first.
  const seen = new Set<number>()
  const points: [number, number][] = []
  for (const page of pages) {
    if (!Array.isArray(page)) throw new Error('Malformed market data')
    for (const row of page) {
      const t = row[0] * 1000
      if (seen.has(t)) continue
      seen.add(t)
      points.push([t, num(row[4])])
    }
  }
  points.sort((a, b) => a[0] - b[0])
  if (points.length < 2) throw new Error('No market data returned')
  return { range, points, source: 'Coinbase Exchange' }
}

async function coingeckoHistory(range: HistoryRange): Promise<MarketHistory> {
  if (Number(range) > 365) throw new Error('Longer history is not available from the fallback source')
  const j = await getJson<{ prices?: [number, number][] }>(`${COINGECKO}/coins/bitcoin/market_chart?vs_currency=usd&days=${range}`, HISTORY_TTL[range])
  const points = (j.prices || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (points.length < 2) throw new Error('No market data returned')
  return { range, points, source: 'CoinGecko' }
}

export async function getHistory(range: HistoryRange): Promise<MarketHistory> {
  try {
    return await coinbaseHistory(range)
  } catch (primary) {
    try {
      return await coingeckoHistory(range)
    } catch {
      throw primary
    }
  }
}

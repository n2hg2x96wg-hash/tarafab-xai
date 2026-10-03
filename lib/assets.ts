// Shared multi-asset types and helpers (client + server).
export type AssetCategory = 'crypto' | 'stock' | 'index' | 'etf'
export type DataState = 'live' | 'delayed' | 'stale' | 'unavailable' | 'error'
export type MarketStatus = '24/7' | 'open' | 'closed' | 'unavailable'

export type AssetQuote = {
  id: string; name: string; category: AssetCategory; note: string
  chart: boolean; automation: boolean
  price: number | null; changePct: number | null; changeAbs: number | null
  high: number | null; low: number | null; prevClose: number | null; volume: number | null
  updatedAt: string | null; state: DataState; market: MarketStatus
  // Data provider of this quote (display/attribution only).
  source?: 'Coinbase Exchange' | 'CoinGecko' | 'Finnhub' | null
}

export const TIMEFRAMES = ['1H', '4H', '1D', '1W', '1M', '1Y'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

// US equity regular session, Mon–Fri 09:30–16:00 New York time. Exchange
// holidays are not modelled; on a holiday the quote is shown as delayed.
export function usMarketOpen(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
    .formatToParts(at).map(x => [x.type, x.value]))
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  const mins = (parseInt(p.hour) % 24) * 60 + parseInt(p.minute)
  return mins >= 570 && mins < 960
}

export function formatPrice(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  const digits = n >= 1000 ? 2 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export type AssetCategory = 'crypto' | 'equity' | 'index'

export type Asset = {
  id?: string
  symbol: string
  name: string
  category: AssetCategory
  description: string
  icon: string
  provider: string | null
  provider_symbol: string | null
  enabled?: boolean
  featured?: boolean
  display_order?: number
  automation_enabled?: boolean
}

export type AssetQuote = {
  price: number | null
  change24h: number | null
  volume24hUsd: number | null
  updatedAt: string | null
  status: 'live' | 'delayed' | 'unavailable'
}

export const DEFAULT_ASSETS: Asset[] = [
  ['BTC', 'Bitcoin', 'crypto', 'The original decentralized digital asset.', '₿', 'coinbase', 'BTC-USD', true],
  ['ETH', 'Ethereum', 'crypto', 'A programmable network and digital asset.', 'Ξ', 'coinbase', 'ETH-USD', true],
  ['SOL', 'Solana', 'crypto', 'A high-throughput digital asset network.', 'S', 'coingecko', 'solana', false],
  ['XRP', 'XRP', 'crypto', 'A digital asset built for fast settlement.', 'X', 'coingecko', 'ripple', false],
  ['USDT', 'Tether', 'crypto', 'A dollar-denominated digital asset.', '₮', 'coingecko', 'tether', false],
  ['TSLA', 'Tesla', 'equity', 'Tesla common stock.', 'T', null, null, false],
  ['AAPL', 'Apple', 'equity', 'Apple common stock.', 'A', null, null, false],
  ['NVDA', 'NVIDIA', 'equity', 'NVIDIA common stock.', 'N', null, null, false],
  ['MSFT', 'Microsoft', 'equity', 'Microsoft common stock.', 'M', null, null, false],
  ['AMZN', 'Amazon', 'equity', 'Amazon common stock.', 'A', null, null, false],
  ['SPX', 'S&P 500', 'index', 'A broad US large-cap market index.', 'S', 'stooq', '^spx', true],
  ['NDX', 'Nasdaq 100', 'index', 'A technology-focused large-cap index.', 'N', 'stooq', '^ndx', false],
  ['DJI', 'Dow Jones', 'index', 'A major US equity market index.', 'D', 'stooq', '^dji', false],
].map(([symbol, name, category, description, icon, provider, provider_symbol, featured]) => ({
  symbol, name, category, description, icon, provider, provider_symbol, featured,
} as Asset))

// Stooq publishes free, no-key end-of-day quotes for major indices (as well
// as equities and crypto), via a plain CSV snapshot. Used only for the index
// assets (e.g. Nasdaq 100, Dow Jones) that Coinbase/CoinGecko do not offer.
// The `f=sd2t2ohlcv` query parameter fixes this column order:
//   s=symbol, d2=date, t2=time, o=open, h=high, l=low, c=close, v=volume
const STOOQ_COLUMNS = ['symbol', 'date', 'time', 'open', 'high', 'low', 'close', 'volume'] as const

async function stooqQuote(symbol: string) {
  const base = process.env.MARKET_STOOQ_BASE || 'https://stooq.com'
  const response = await fetch(`${base}/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`, {
    cache: 'no-store', headers: { Accept: 'text/csv' }, signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`provider responded ${response.status}`)
  const text = await response.text()
  // Header row, then one data row. A symbol Stooq does not recognize returns
  // "N/D" fields instead of an error. Stooq's CSV does not quote fields (all
  // values are plain symbols/numbers/dates), so a plain split is safe here,
  // but we still validate the field count to guard against unexpected
  // provider output rather than silently mis-mapping columns.
  const cells = text.trim().split(/\r?\n/)[1]?.split(',') || []
  if (cells.length !== STOOQ_COLUMNS.length) throw new Error('malformed provider response')
  const row = Object.fromEntries(STOOQ_COLUMNS.map((name, i) => [name, cells[i]])) as Record<typeof STOOQ_COLUMNS[number], string | undefined>
  if (row.close === 'N/D' || row.open === 'N/D') throw new Error('provider does not recognize symbol')
  const open = Number(row.open)
  const price = Number(row.close)
  const updatedAt = new Date(`${row.date}T${row.time || '00:00:00'}Z`)
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(updatedAt.getTime())) throw new Error('malformed provider response')
  if (Date.now() - updatedAt.getTime() > 7 * 24 * 60 * 60 * 1000) throw new Error('provider quote is too old')
  return { price, change24h: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null, updatedAt: updatedAt.toISOString() }
}

const FRESH_FOR_MS = 3 * 60_000

function freshness(updatedAt: string) {
  const time = Date.parse(updatedAt)
  if (!Number.isFinite(time) || time > Date.now() + 60_000) throw new Error('malformed provider timestamp')
  return Date.now() - time <= FRESH_FOR_MS ? 'live' as const : 'delayed' as const
}

export async function quoteAsset(asset: Asset): Promise<AssetQuote> {
  if (!asset.provider || !asset.provider_symbol) {
    return { price: null, change24h: null, volume24hUsd: null, updatedAt: null, status: 'unavailable' }
  }
  try {
    if (asset.provider === 'stooq') {
      const { price, change24h, updatedAt } = await stooqQuote(asset.provider_symbol)
      return { price, change24h, volume24hUsd: null, updatedAt, status: 'delayed' }
    }
    if (asset.provider === 'coinbase') {
      const base = process.env.MARKET_COINBASE_BASE || 'https://api.exchange.coinbase.com'
      const [tickerResponse, statsResponse] = await Promise.all([
        fetch(`${base}/products/${asset.provider_symbol}/ticker`, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }),
        fetch(`${base}/products/${asset.provider_symbol}/stats`, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }),
      ])
      if (!tickerResponse.ok || !statsResponse.ok) throw new Error('provider request failed')
      const [ticker, stats] = await Promise.all([
        tickerResponse.json() as Promise<Record<string, unknown>>,
        statsResponse.json() as Promise<Record<string, unknown>>,
      ])
      const price = Number(ticker.price)
      const open = Number(stats.open)
      const volume = Number(stats.volume)
      const updatedAt = typeof ticker.time === 'string' ? ticker.time : ''
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(updatedAt))) throw new Error('malformed provider response')
      return {
        price,
        change24h: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null,
        volume24hUsd: Number.isFinite(volume) && volume >= 0 ? volume * price : null,
        updatedAt,
        status: freshness(updatedAt),
      }
    }
    if (asset.provider === 'coingecko') {
      const base = process.env.MARKET_COINGECKO_BASE || 'https://api.coingecko.com/api/v3'
      const response = await fetch(`${base}/simple/price?vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true&ids=${encodeURIComponent(asset.provider_symbol)}`, {
        cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error('provider request failed')
      const data = await response.json() as Record<string, Record<string, unknown>>
      const row = data[asset.provider_symbol] || {}
      const price = Number(row.usd)
      const timestamp = Number(row.last_updated_at)
      const updatedAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : ''
      if (!Number.isFinite(price) || price <= 0 || !updatedAt) throw new Error('malformed provider response')
      return {
        price,
        change24h: Number.isFinite(Number(row.usd_24h_change)) ? Number(row.usd_24h_change) : null,
        volume24hUsd: Number.isFinite(Number(row.usd_24h_vol)) ? Number(row.usd_24h_vol) : null,
        updatedAt,
        status: freshness(updatedAt),
      }
    }
  } catch (error) {
    console.error(`Market quote unavailable for ${asset.symbol}:`, error)
  }
  return { price: null, change24h: null, volume24hUsd: null, updatedAt: null, status: 'unavailable' }
}

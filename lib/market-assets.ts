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
  status: 'live' | 'unavailable' | 'stale'
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
  ['SPX', 'S&P 500', 'index', 'A broad US large-cap market index.', 'S', null, null, true],
  ['NDX', 'Nasdaq 100', 'index', 'A technology-focused large-cap index.', 'N', null, null, false],
  ['DJI', 'Dow Jones', 'index', 'A major US equity market index.', 'D', null, null, false],
].map(([symbol, name, category, description, icon, provider, provider_symbol, featured]) => ({
  symbol, name, category, description, icon, provider, provider_symbol, featured,
} as Asset))

export async function quoteAsset(asset: Asset): Promise<AssetQuote> {
  if (!asset.provider || !asset.provider_symbol) {
    return { price: null, change24h: null, volume24hUsd: null, updatedAt: null, status: 'unavailable' }
  }
  try {
    const base = asset.provider === 'coinbase'
      ? `${process.env.MARKET_COINBASE_BASE || 'https://api.exchange.coinbase.com'}/products/${asset.provider_symbol}/ticker`
      : `${process.env.MARKET_COINGECKO_BASE || 'https://api.coingecko.com/api/v3'}/simple/price?vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&ids=${asset.provider_symbol}`
    const response = await fetch(base, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`provider responded ${response.status}`)
    const data = await response.json() as Record<string, any>
    if (asset.provider === 'coinbase') {
      const price = Number(data.price)
      if (!Number.isFinite(price)) throw new Error('malformed provider response')
      return { price, change24h: null, volume24hUsd: Number(data.volume) * price || null, updatedAt: data.time || new Date().toISOString(), status: 'live' }
    }
    const row = data[asset.provider_symbol] || {}
    const price = Number(row.usd)
    if (!Number.isFinite(price)) throw new Error('malformed provider response')
    return { price, change24h: Number.isFinite(Number(row.usd_24h_change)) ? Number(row.usd_24h_change) : null, volume24hUsd: Number(row.usd_24h_vol) || null, updatedAt: new Date().toISOString(), status: 'live' }
  } catch {
    return { price: null, change24h: null, volume24hUsd: null, updatedAt: null, status: 'unavailable' }
  }
}

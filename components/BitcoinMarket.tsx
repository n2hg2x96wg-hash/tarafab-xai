'use client'

import { useEffect, useState, useCallback } from 'react'

interface MarketData {
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  marketCap: number
  lastUpdated: string
}

type Status = 'loading' | 'live' | 'error'

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const compact = (n: number) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(2)}M`

export function BitcoinMarketCard() {
  const [data, setData] = useState<MarketData | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  const load = useCallback(async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin')
      if (!res.ok) throw new Error()
      const [btc] = await res.json()
      if (!btc) throw new Error()
      setData({
        price: btc.current_price,
        change24h: btc.price_change_percentage_24h ?? 0,
        high24h: btc.high_24h,
        low24h: btc.low_24h,
        volume24h: btc.total_volume,
        marketCap: btc.market_cap,
        lastUpdated: new Date(btc.last_updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      })
      setStatus('live')
    } catch {
      setStatus(s => (s === 'live' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const stats: [string, string | null][] = [
    ['24h high', data ? usd(data.high24h) : null],
    ['24h low', data ? usd(data.low24h) : null],
    ['24h volume', data ? compact(data.volume24h) : null],
    ['Market cap', data ? compact(data.marketCap) : null],
  ]

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">Bitcoin market</h3>
          <p className="text-[13px] text-fg-faint mt-1">
            {status === 'error' && !data ? 'Market data is unavailable right now.' : data ? `Updated ${data.lastUpdated}` : 'Loading'}
          </p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-xl font-semibold text-fg tabular-nums">{usd(data.price)}</div>
            <div className={`text-[13px] tabular-nums ${data.change24h >= 0 ? 'price-up' : 'price-down'}`}>
              {data.change24h >= 0 ? '+' : '-'}{Math.abs(data.change24h).toFixed(2)}% (24h)
            </div>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px bg-ink-700 border border-ink-700 rounded-md overflow-hidden">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-ink-900 p-3">
            <dt className="text-xs text-fg-faint mb-1">{label}</dt>
            <dd className="text-sm font-medium text-fg tabular-nums">
              {value ?? (status === 'error' ? 'Unavailable' : <span className="skeleton inline-block w-20 h-4 align-middle" />)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-fg-faint mt-4">Source: CoinGecko. Refreshes every 60 seconds.</p>
    </div>
  )
}

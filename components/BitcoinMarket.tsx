'use client'

import { useEffect, useState, useCallback } from 'react'

interface MarketData {
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  lastUpdated: string
  status: 'live' | 'loading' | 'error'
}

interface NetworkData {
  blockHeight: number | null
  networkStatus: string
  feeEstimate: string
  lastUpdated: string
  status: 'live' | 'loading' | 'error'
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-6 ${className}`} />
}

function PriceSparkline({ positive }: { positive: boolean }) {
  const color = positive ? '#10b981' : '#ef4444'
  const points = positive
    ? '0,40 15,35 30,38 45,28 60,32 75,20 90,15 105,10 120,5'
    : '0,10 15,15 30,12 45,22 60,18 75,30 90,35 105,38 120,40'

  return (
    <svg width="120" height="45" viewBox="0 0 120 45" className="opacity-70">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BitcoinMarketCard() {
  const [data, setData] = useState<MarketData>({
    price: 0, change24h: 0, high24h: 0, low24h: 0, volume24h: 0,
    lastUpdated: '', status: 'loading',
  })

  const fetchMarketData = useCallback(async () => {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24h=true&include_low_24h=true&include_last_updated_at=true',
        { next: { revalidate: 60 } }
      )
      if (!res.ok) throw new Error('API error')
      const json = await res.json()
      const btc = json.bitcoin
      setData({
        price: btc.usd,
        change24h: btc.usd_24h_change,
        high24h: btc.usd_24h_high ?? 0,
        low24h: btc.usd_24h_low ?? 0,
        volume24h: btc.usd_24h_vol,
        lastUpdated: new Date(btc.last_updated_at * 1000).toLocaleTimeString(),
        status: 'live',
      })
    } catch {
      setData(prev => ({ ...prev, status: 'error', lastUpdated: new Date().toLocaleTimeString() }))
    }
  }, [])

  useEffect(() => {
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 60_000)
    return () => clearInterval(interval)
  }, [fetchMarketData])

  const isPositive = data.change24h >= 0
  const formatUSD = (n: number) => n > 0 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const formatVol = (n: number) => n > 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n > 1e6 ? `$${(n / 1e6).toFixed(2)}M` : '—'

  return (
    <div className="glass glass-hover rounded-2xl p-6 relative overflow-hidden">
      {/* BTC badge */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-lg font-bold shadow-[0_0_20px_rgba(251,146,60,0.3)]">
            ₿
          </div>
          <div>
            <div className="font-semibold text-white">Bitcoin</div>
            <div className="text-xs text-slate-500">BTC / USD</div>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
          data.status === 'live'
            ? isPositive
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
            : 'bg-slate-500/15 text-slate-400'
        }`}>
          {data.status === 'loading' ? (
            '···'
          ) : data.status === 'error' ? (
            '⚠ Unavailable'
          ) : (
            <>
              {isPositive ? '▲' : '▼'} {Math.abs(data.change24h).toFixed(2)}%
            </>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        {data.status === 'loading' ? (
          <Skeleton className="w-48 h-10 mb-1" />
        ) : data.status === 'error' ? (
          <div className="text-slate-500 text-lg">Market data temporarily unavailable</div>
        ) : (
          <div className="text-4xl font-bold tracking-tight text-white">
            {formatUSD(data.price)}
          </div>
        )}
      </div>

      {/* Sparkline */}
      {data.status === 'live' && (
        <div className="mb-6">
          <PriceSparkline positive={isPositive} />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '24h High', value: data.status === 'live' ? formatUSD(data.high24h) : null },
          { label: '24h Low', value: data.status === 'live' ? formatUSD(data.low24h) : null },
          { label: '24h Volume', value: data.status === 'live' ? formatVol(data.volume24h) : null },
          { label: 'Last Updated', value: data.status === 'live' ? data.lastUpdated : null },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            {value === null ? (
              <Skeleton className="w-20 h-4" />
            ) : (
              <div className="text-sm font-semibold text-white">{value}</div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-4">Market data provided by CoinGecko</p>
    </div>
  )
}

export function BitcoinNetworkCard() {
  const [data, setData] = useState<NetworkData>({
    blockHeight: null, networkStatus: 'Loading…',
    feeEstimate: '—', lastUpdated: '—', status: 'loading',
  })

  const fetchNetwork = useCallback(async () => {
    try {
      const [blockRes, feeRes] = await Promise.all([
        fetch('https://blockstream.info/api/blocks/tip/height'),
        fetch('https://blockstream.info/api/fee-estimates'),
      ])
      if (!blockRes.ok) throw new Error()
      const height = await blockRes.text()
      let fee = '—'
      if (feeRes.ok) {
        const fees: Record<string, number> = await feeRes.json()
        const target6 = fees['6']
        if (target6) fee = `~${Math.round(target6)} sat/vB`
      }
      setData({
        blockHeight: parseInt(height, 10),
        networkStatus: 'Operational',
        feeEstimate: fee,
        lastUpdated: new Date().toLocaleTimeString(),
        status: 'live',
      })
    } catch {
      setData(prev => ({ ...prev, status: 'error', lastUpdated: new Date().toLocaleTimeString() }))
    }
  }, [])

  useEffect(() => {
    fetchNetwork()
    const interval = setInterval(fetchNetwork, 120_000)
    return () => clearInterval(interval)
  }, [fetchNetwork])

  const stats = [
    { label: 'Network Status', value: data.status === 'live' ? data.networkStatus : null, icon: '●', color: data.status === 'live' ? 'text-emerald-400' : 'text-slate-500' },
    { label: 'Latest Block', value: data.blockHeight !== null ? `#${data.blockHeight.toLocaleString()}` : null, icon: '⬡' },
    { label: 'Est. Block Time', value: data.status === 'live' ? '~10 min' : null, icon: '⏱' },
    { label: 'Fee Estimate', value: data.status === 'live' ? data.feeEstimate : null, icon: '⛽' },
  ]

  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-white">Bitcoin Network</h3>
          <p className="text-xs text-slate-500 mt-0.5">Live blockchain data</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${
          data.status === 'loading' ? 'bg-yellow-400 animate-pulse' :
          data.status === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
        }`} />
      </div>

      {data.status === 'error' && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          Network data temporarily unavailable
        </div>
      )}

      <div className="space-y-3">
        {stats.map(({ label, value, icon, color }) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className={`text-xs ${color ?? 'text-slate-500'}`}>{icon}</span>
              {label}
            </div>
            {value === null ? (
              <Skeleton className="w-24 h-4" />
            ) : (
              <span className="text-sm font-semibold text-white">{value}</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-4">
        Network data via Blockstream API · Updated {data.lastUpdated}
      </p>
    </div>
  )
}

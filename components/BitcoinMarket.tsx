'use client'

import { compactUsd, timeAgo, useBtcSummary } from '@/components/useMarket'
import { MarketStatusPill } from '@/components/LandingExtras'

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BitcoinMarketCard() {
  const { summary: data, status, fetchedAt, retry } = useBtcSummary(60_000)

  const stats: [string, string | null][] = [
    ['24h high', data ? usd(data.high24h) : null],
    ['24h low', data ? usd(data.low24h) : null],
    ['24h volume', data ? compactUsd(data.volume24hUsd) : null],
    ['24h change', data ? `${data.change24h >= 0 ? '+' : '-'}${Math.abs(data.change24h).toFixed(2)}%` : null],
  ]

  return (
    <div className="panel panel-lift p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-fg">Bitcoin market</h3>
            <MarketStatusPill status={status} />
          </div>
          <p className="text-[13px] text-fg-faint mt-1">
            {status === 'error' && !data
              ? 'Market data is unavailable right now.'
              : fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : 'Loading'}
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
            <dd className={`text-sm font-medium tabular-nums ${label === '24h change' && data ? (data.change24h >= 0 ? 'price-up' : 'price-down') : 'text-fg'}`}>
              {value ?? (status === 'error' ? 'Unavailable' : <span className="skeleton inline-block w-20 h-4 align-middle" />)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[11px] text-fg-faint">
        <span>{data ? `Market data provided by ${data.source}` : 'Refreshes every 60 seconds.'}</span>
        {(status === 'error' || status === 'stale') && (
          <button onClick={retry} className="underline underline-offset-2 hover:text-fg shrink-0">Try again</button>
        )}
      </div>
    </div>
  )
}

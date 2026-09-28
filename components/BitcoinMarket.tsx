'use client'

import { compactUsd, useBtcSummary } from '@/components/useMarket'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { timeAgoT } from '@/lib/i18n/format'
import { MarketStatusPill } from '@/components/LandingExtras'

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BitcoinMarketCard() {
  const { summary: data, status, fetchedAt, retry } = useBtcSummary(60_000)
  const { t } = useI18n()

  const stats: [TKey, string | null][] = [
    ['market.high24h', data ? usd(data.high24h) : null],
    ['market.low24h', data ? usd(data.low24h) : null],
    ['market.volume24h', data ? compactUsd(data.volume24hUsd) : null],
    ['market.change24h', data ? `${data.change24h >= 0 ? '+' : '-'}${Math.abs(data.change24h).toFixed(2)}%` : null],
  ]

  return (
    <div className="panel panel-lift p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">{t('market.bitcoinMarket')} <span className="text-fg-faint font-normal whitespace-nowrap">BTC/USD</span></h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-faint mt-1.5">
            <MarketStatusPill status={status} />
            {status === 'error' && !data
              ? t('market.unavailable')
              : fetchedAt ? t('common.updated', { time: timeAgoT(t, fetchedAt) }) : t('common.loading')}
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
            <dt className="text-xs text-fg-faint mb-1">{t(label)}</dt>
            <dd className={`text-sm font-medium tabular-nums ${label === 'market.change24h' && data ? (data.change24h >= 0 ? 'price-up' : 'price-down') : 'text-fg'}`}>
              {value ?? (status === 'error' ? t('common.unavailable') : <span className="skeleton inline-block w-20 h-4 align-middle" />)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[11px] text-fg-faint">
        <span>{data ? t('common.marketDataBy', { source: data.source }) : t('market.refreshEvery')}</span>
        <button onClick={retry} disabled={status === 'loading'} className="inline-flex items-center min-h-8 px-2 -mr-2 rounded underline underline-offset-2 hover:text-fg shrink-0 disabled:opacity-50">
          {status === 'error' || status === 'stale' ? t('common.tryAgain') : t('common.refresh')}
        </button>
      </div>
    </div>
  )
}

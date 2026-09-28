'use client'

import { compactUsd, useBtcSummary } from '@/components/useMarket'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { MarketStatusPill } from '@/components/LandingExtras'
import { AnimatedPrice, freshnessText, useNow } from '@/components/MarketBits'

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BitcoinMarketCard() {
  const { summary: data, status, fetchedAt, retry } = useBtcSummary(60_000)
  const { t } = useI18n()
  useNow()

  const up = (data?.change24h ?? 0) >= 0
  const stats: [TKey, string | null][] = [
    ['market.high24h', data ? usd(data.high24h) : null],
    ['market.low24h', data ? usd(data.low24h) : null],
    ['market.volume24h', data ? compactUsd(data.volume24hUsd) : null],
  ]

  return (
    <div className="panel panel-lift p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-fg-muted">{t('market.bitcoinMarket')} <span className="text-fg-faint whitespace-nowrap">BTC/USD</span></h3>
        <MarketStatusPill status={status} />
      </div>

      {/* Primary: the price */}
      <div className="mt-3 min-h-[64px]">
        {data ? (
          <>
            <AnimatedPrice value={data.price} format={usd} className="text-[30px] sm:text-[34px] leading-none font-semibold tracking-tight text-fg" />
            <div className={`mt-2 text-sm tabular-nums ${up ? 'price-up' : 'price-down'}`}>
              <span aria-hidden="true">{up ? '▲' : '▼'}</span> {Math.abs(data.change24h).toFixed(2)}% <span className="text-fg-faint">24h</span>
            </div>
          </>
        ) : status === 'error' ? (
          <p className="text-sm text-fg-muted pt-2">{t('market.unavailable')}</p>
        ) : (
          <div className="space-y-2" aria-label={t('common.loading')}><div className="skeleton h-9 w-48" /><div className="skeleton h-4 w-24" /></div>
        )}
      </div>

      {/* Secondary: 24h statistics */}
      <dl className="grid grid-cols-3 gap-2 mt-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md bg-ink-850 px-3 py-2.5 min-w-0">
            <dt className="text-[11px] text-fg-faint truncate">{t(label)}</dt>
            <dd className="text-[13px] font-medium tabular-nums text-fg mt-0.5 truncate">
              {value ?? (status === 'error' ? '—' : <span className="skeleton inline-block w-14 h-4 align-middle" />)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[12px] text-fg-faint">
        <span aria-live="polite">{freshnessText(t, status, fetchedAt)}</span>
        <button onClick={retry} disabled={status === 'loading'} className="inline-flex items-center min-h-9 px-2.5 -mr-2.5 rounded-md hover:text-fg hover:bg-ink-850 transition-colors shrink-0 disabled:opacity-50">
          {status === 'error' || status === 'stale' ? t('common.tryAgain') : t('common.refresh')}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useId, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { IconInfo } from '@/components/Icons'

// One place for market-data attribution per page, instead of a "provided by"
// line under every card. Collapsed by default; the provider names stay one
// tap away. Providers listed are the ones this app actually calls.
export function DataSources({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const id = useId()
  const rows: [string, string][] = [
    ['Coinbase Exchange', t('sources.coinbase')],
    ['CoinGecko', t('sources.coingecko')],
    ['mempool.space', t('sources.mempool')],
    ['TradingView', t('sources.tradingview')],
  ]
  return (
    <div className={`text-[12px] text-fg-faint ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 min-h-8 rounded hover:text-fg transition-colors"
      >
        <IconInfo width={14} height={14} aria-hidden="true" />
        {t('sources.title')}
      </button>
      <div id={id} hidden={!open} className="mt-2 rounded-lg border border-ink-700 bg-ink-900/60 p-3 sm:p-4 max-w-2xl">
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {rows.map(([name, what]) => (
            <div key={name} className="contents">
              <dt className="text-fg-muted font-medium">{name}</dt>
              <dd className="mb-1 sm:mb-0">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3">{t('sources.note')}</p>
      </div>
    </div>
  )
}

'use client'

import { useI18n } from '@/lib/i18n/I18nProvider'
import { CoinGeckoCredit } from './CoinGeckoCredit'

// Market data attribution, kept compact and out of the way: one quiet line
// with the informational-use note, plus CoinGecko's required credit
// ("Powered by CoinGecko", linked) only when CoinGecko data is on screen.
// `sources` lists the providers of the figures actually shown.
export function MarketSources({ sources, className = '' }: { sources: string[]; className?: string }) {
  const { t } = useI18n()
  return (
    <p className={`market-sources text-[11px] text-fg-faint ${className}`} data-market-sources>
      {t('landing.footer.attr')}
      {sources.includes('CoinGecko') && <> <CoinGeckoCredit as="span" /></>}
    </p>
  )
}

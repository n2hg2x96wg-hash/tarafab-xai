'use client'

import { useI18n } from '@/lib/i18n/I18nProvider'

// Market data attribution, kept compact and out of the way: one quiet line
// with the informational-use note.
// CoinGecko's attribution ("Powered by CoinGecko", linked) stays visible
// whenever CoinGecko data can appear, as its free API terms require.
export function MarketSources({ sources, className = '' }: { sources: string[]; className?: string }) {
  const { t } = useI18n()
  const list = sources.length ? sources : ['Coinbase Exchange', 'CoinGecko']
  return (
    <p className={`market-sources text-[11px] text-fg-faint ${className}`} data-market-sources>
      {t('landing.footer.attr')}
      {list.includes('CoinGecko') && <> Data provided by <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer" className="hover:text-fg-muted underline-offset-2 hover:underline">CoinGecko</a>.</>}
    </p>
  )
}

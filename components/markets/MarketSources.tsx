'use client'

import { useI18n } from '@/lib/i18n/I18nProvider'

// One attribution line for market data, rendered inside the market
// components (not as a detached footer). CoinGecko's free API requires
// attribution wherever its data may appear; Coinbase/Finnhub are named as the
// sources they are.
export function MarketSources({ sources, className = '' }: { sources: string[]; className?: string }) {
  const { t } = useI18n()
  const list = sources.length ? sources : ['Coinbase Exchange', 'CoinGecko']
  return (
    <p className={`text-[11px] leading-relaxed text-fg-faint ${className}`} data-market-sources>
      {list.join(' · ')} · {t('landing.footer.attr')}{' '}
      {list.includes('CoinGecko') && <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">Powered by CoinGecko</a>}
    </p>
  )
}

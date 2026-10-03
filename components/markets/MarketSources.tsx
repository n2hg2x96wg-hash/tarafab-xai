'use client'

import { useI18n } from '@/lib/i18n/I18nProvider'

// Market data attribution, kept compact and out of the way: one quiet line
// ("Market data sources · Details") that expands to name the providers this
// component's data actually comes from and the informational-use note.
// CoinGecko's attribution ("Powered by CoinGecko", linked) stays visible
// whenever CoinGecko data can appear, as its free API terms require.
export function MarketSources({ sources, className = '' }: { sources: string[]; className?: string }) {
  const { t } = useI18n()
  const list = sources.length ? sources : ['Coinbase Exchange', 'CoinGecko']
  return (
    <div className={`market-sources flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-faint ${className}`} data-market-sources>
      <details className="group min-w-0">
        <summary className="cursor-pointer list-none inline-flex items-center gap-1 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded">
          {t('market.sourcesLabel')} · <span className="underline underline-offset-2">{t('market.sourcesDetails')}</span>
          <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <p className="mt-1.5 leading-relaxed max-w-xl">{list.join(' · ')}. {t('landing.footer.attr')}</p>
      </details>
      {list.includes('CoinGecko') && <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer" className="hover:text-fg-muted underline-offset-2 hover:underline">Powered by CoinGecko</a>}
    </div>
  )
}

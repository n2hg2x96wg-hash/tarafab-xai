'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { marketsText } from '@/lib/i18n/markets'
import { Converter, PriceHistory } from '@/components/LandingExtras'
import { useBtcQuote } from './assetStore'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { MountOnView } from './LazyOnView'
import LiveMarketBoard from './LiveMarketBoard'

export default function LandingMarkets() {
  const { locale } = useI18n()
  const t = (k: string, v?: Record<string, string | number>) => marketsText(locale, k, v)
  // The calculator converts at the same Bitcoin quote, with the same status,
  // as the hero, ticker and board on this page.
  const btc = useBtcQuote()
  // Public market preview: one headline, the real market board, a clean
  // price-history chart and the Bitcoin calculator beside it. Deeper market detail (24h figures, charts, blocks,
  // network data) lives in the client dashboard's Markets section. The text
  // column stays beside the board while it scrolls (clip, not hidden, so
  // sticky positioning still works); its button is secondary to the hero's.
  return (
    <section aria-labelledby="markets-title" className="lp-section border-b border-ink-700 relative [overflow-x:clip]">
      <div className="lp-wrap">
        <div className="grid gap-8 lg:gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="lp-eyebrow">{t('gm.eyebrow')}</p>
            <h2 id="markets-title" className="lp-h2">{t('gm.title')}</h2>
            <p className="lp-lead max-w-lg">{t('gm.body')}</p>
            <Link href="/sign-up" className="btn btn-outline min-h-12 px-6 mt-6 inline-flex">{t('gm.cta')}</Link>
          </div>
          <div className="space-y-4 min-w-0">
            <LiveMarketBoard />
            <MountOnView className="min-h-[420px]">
              <ErrorBoundary label="Price history"><PriceHistory compact /></ErrorBoundary>
            </MountOnView>
            <ErrorBoundary label="Bitcoin calculator">
              <Converter price={btc.state === 'unavailable' || btc.state === 'loading' ? undefined : btc.price ?? undefined} status={btc.state} updatedAt={btc.updatedAt} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </section>
  )
}

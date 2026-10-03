'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { marketsText } from '@/lib/i18n/markets'
import { PriceHistory } from '@/components/LandingExtras'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { MountOnView } from './LazyOnView'
import LiveMarketBoard from './LiveMarketBoard'

export default function LandingMarkets() {
  const { locale } = useI18n()
  const t = (k: string, v?: Record<string, string | number>) => marketsText(locale, k, v)
  // Public market preview: one headline, the real market board and a clean
  // price-history chart. Deeper market detail (24h figures, charts, blocks,
  // network data) lives in the client dashboard's Markets section.
  return (
    <section id="markets" className="scroll-mt-16 border-b border-ink-700 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid gap-8 lg:gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">{t('gm.eyebrow')}</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">{t('gm.title')}</h2>
            <p className="mt-4 text-fg-muted leading-relaxed max-w-lg">{t('gm.body')}</p>
            <Link href="/sign-up" className="btn btn-solid mt-6 inline-flex">{t('gm.cta')}</Link>
          </div>
          <div className="space-y-4 min-w-0">
            <LiveMarketBoard />
            <MountOnView className="min-h-[420px]">
              <ErrorBoundary label="Price history"><PriceHistory compact /></ErrorBoundary>
            </MountOnView>
          </div>
        </div>
      </div>
    </section>
  )
}

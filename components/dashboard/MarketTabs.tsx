'use client'

// Market sections for the client dashboard. They reuse the landing page's
// real-data components; nothing here is duplicated or simulated.
import { useBtcSummary } from '@/components/useMarket'
import { Converter, NetworkFacts, PriceHistory } from '@/components/LandingExtras'
import { LatestBlocks } from '@/components/LiveCrypto'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DataSources } from '@/components/DataSources'
import { useI18n } from '@/lib/i18n/I18nProvider'

export function MarketActivityTab() {
  const { t } = useI18n()
  return (
    <div className="space-y-4 panel-in">
      <ErrorBoundary label={t('market.blocksTitle')}><LatestBlocks /></ErrorBoundary>
      <ErrorBoundary label={t('network.title')}><NetworkFacts /></ErrorBoundary>
      <DataSources />
    </div>
  )
}

export function PriceHistoryTab() {
  const { t } = useI18n()
  const { summary } = useBtcSummary(60_000)
  return (
    <div className="space-y-4 panel-in">
      <div className="grid xl:grid-cols-[2fr_1fr] gap-4">
        <ErrorBoundary label={t('market.historyTitle')}><PriceHistory /></ErrorBoundary>
        <ErrorBoundary label={t('market.calculator')}><Converter price={summary?.price} /></ErrorBoundary>
      </div>
      <DataSources />
    </div>
  )
}

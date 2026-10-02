'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { marketsText } from '@/lib/i18n/markets'
import { AutomationFlow } from '@/components/automation/AutomationFlow'
import { useAssets } from './useAssets'
import GlobalMarketVisual from './GlobalMarketVisual'

const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'] as const
const ICON: Record<string, string> = { f1: '◈', f2: '◉', f3: '⚡', f4: '▲', f5: '★', f6: '◐', f7: '▣', f8: '◆' }

export default function LandingMarkets() {
  const { locale, intl } = useI18n()
  const t = (k: string, v?: Record<string, string | number>) => marketsText(locale, k, v)
  // The real BTC quote from the shared market feed (no invented price).
  const { assets } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  return (
    <section id="intelligence" className="scroll-mt-16 border-b border-ink-700 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">{t('gm.eyebrow')}</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">{t('gm.title')}</h2>
            <p className="mt-4 text-fg-muted leading-relaxed max-w-lg">{t('gm.body')}</p>
            <Link href="/sign-up" className="btn btn-solid mt-6 inline-flex">{t('gm.cta')}</Link>
          </div>
          <div>
            <GlobalMarketVisual label={t('gm.caption')} />
            <p className="mt-2 text-center text-[11px] text-fg-faint">{t('gm.caption')}</p>
          </div>
        </div>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(f => (
            <li key={f} className="panel asset-card p-4">
              <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-brand-300 text-sm" aria-hidden="true">{ICON[f]}</span>
              <h3 className="mt-3 text-[15px] font-semibold text-fg">{t(`gm.${f}.t`)}</h3>
              <p className="mt-1 text-[13px] text-fg-muted leading-relaxed">{t(`gm.${f}.b`)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-16 grid lg:grid-cols-[0.8fr_1.2fr] gap-8 items-center" aria-labelledby="la-title">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-brand-300">{t('la.eyebrow')}</p>
            <h3 id="la-title" className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">{t('la.title')}</h3>
            <p className="mt-3 text-[15px] text-fg-muted leading-relaxed">{t('la.body')}</p>
            <Link href="/sign-up" className="btn btn-outline mt-5 inline-flex">{t('la.cta')}</Link>
          </div>
          <div className="panel p-4 sm:p-5 btc-auto">
            <AutomationFlow automation={null} quote={btc} t={t} intl={intl} label={t('flow.illustration')} illustration vertical />
          </div>
        </div>
      </div>
    </section>
  )
}

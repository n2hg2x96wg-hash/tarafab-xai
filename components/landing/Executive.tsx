'use client'

// Public landing page building blocks ("Executive Bitcoin + Minimal Modern").
// Every figure shown here comes from the existing market feeds; when a feed is
// connecting, delayed or down, the component says so instead of showing a
// number. Nothing is animated except a short fade on price changes.

import Link from 'next/link'
import { useAssets } from '@/components/markets/assetStore'
import { effectiveState } from '@/lib/marketStatus'
import { formatPrice, type AssetQuote } from '@/lib/assets'
import type { useLiveMarket } from '@/components/LiveCrypto'
import { IconChart, IconCheck, IconList, IconLock } from '@/components/Icons'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

type Market = ReturnType<typeof useLiveMarket>

const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* Hero visual: original Bitcoin artwork (public/landing, source in
   design/landing) with the current BTC/USD quote from the existing feed.
   The artwork is dark in both themes, so its caption uses fixed colours
   (the theme's "white" token follows the theme). */
export function HeroVisual({ market }: { market: Market }) {
  const { t } = useI18n()
  const q = market.quotes['BTC-USD']
  const live = market.status === 'live' || market.status === 'polling'
  const change = q?.open24h ? (q.price / q.open24h - 1) * 100 : null
  return (
    <figure className="ex-visual relative overflow-hidden rounded-2xl border border-[#ffffff14] bg-[#08090b] shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)]" data-hero-visual>
      <picture>
        <source media="(min-width: 1024px)" srcSet="/landing/hero-bitcoin.webp" />
        <img src="/landing/hero-bitcoin-960.webp" alt={t('landing.ex.visualAlt')} width={1600} height={1200}
          className="block w-full h-auto aspect-[4/3] object-cover" decoding="async" fetchPriority="high" />
      </picture>
      {/* Current quote, or an honest state: never a number that is not current. */}
      <figcaption className="relative border-t border-[#ffffff1a] bg-[#0b0c0f] px-4 py-3 text-[#fff] sm:absolute sm:left-5 sm:top-5 sm:rounded-xl sm:border sm:bg-[#000000a6] sm:backdrop-blur-md sm:py-3" data-hero-quote>
        <div className="flex items-center gap-2 text-[11px] sm:text-[12px] text-[#ffffffb3]">
          <span>{t('market.bitcoinMarket')} · BTC/USD</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
            <span className={`h-1.5 w-1.5 rounded-full ${live && q ? 'bg-emerald-400' : market.status === 'error' ? 'bg-amber-400' : 'bg-[#ffffff66]'}`} aria-hidden="true" />
            {live && q ? t('status.live') : market.status === 'error' ? t('status.dataUnavailable') : t('status.connecting')}
          </span>
        </div>
        {q && live ? (
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[20px] sm:text-[24px] font-semibold tabular-nums tracking-tight">{usd(q.price)}</span>
            {change != null && <span className={`text-[12px] tabular-nums font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(2)}% <span className="text-[#ffffff80] font-normal">24h</span></span>}
          </p>
        ) : <p className="mt-0.5 text-[13px] text-[#ffffff99]">{t('landing.scene.noQuote')}</p>}
      </figcaption>
    </figure>
  )
}

/* Four plain benefits under the hero (existing, accurate copy). */
const BENEFITS: { icon: typeof IconChart; title: TKey; sub: TKey }[] = [
  { icon: IconChart, title: 'landing.cap.marketTitle', sub: 'landing.ex.b1Sub' },
  { icon: IconCheck, title: 'trust.review', sub: 'trust.reviewSub' },
  { icon: IconList, title: 'trust.audit', sub: 'trust.auditSub' },
  { icon: IconLock, title: 'trust.access', sub: 'trust.accessSub' },
]
export function BenefitRow() {
  const { t } = useI18n()
  return (
    <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5" data-benefits>
      {BENEFITS.map(({ icon: Icon, title, sub }) => (
        <li key={title} className="flex items-start gap-3 min-w-0">
          <span className="ex-icon shrink-0" aria-hidden="true"><Icon width={18} height={18} /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-fg leading-snug">{t(title)}</span>
            <span className="block text-[12.5px] text-fg-faint leading-snug">{t(sub)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* Market strip: the first supported assets with their real quote and state. */
const PREFERRED = ['BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'BNB']
const STATE_KEY: Record<string, TKey> = { live: 'status.live', delayed: 'status.delayed', stale: 'status.stale', unavailable: 'status.dataUnavailable' }
const STATE_DOT: Record<string, string> = { live: 'bg-emerald-400', delayed: 'bg-amber-400', stale: 'bg-amber-400', unavailable: 'bg-fg-faint' }

function pick(assets: AssetQuote[]) {
  const ordered = [...assets].sort((a, b) => {
    const ia = PREFERRED.indexOf(a.id), ib = PREFERRED.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a.category === 'crypto' ? -1 : 1) - (b.category === 'crypto' ? -1 : 1)
  })
  return ordered.slice(0, 4)
}

function AssetCard({ a, failed }: { a: AssetQuote; failed: boolean }) {
  const { t } = useI18n()
  const st = effectiveState(a, failed)
  const usable = a.price != null && st !== 'unavailable'
  const up = (a.changePct ?? 0) >= 0
  return (
    <li className="ex-asset flex items-center gap-3 sm:block" data-asset={a.id} data-state={st}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`ex-coin ${a.id === 'BTC' ? 'ex-coin-btc' : ''}`} aria-hidden="true">{a.id.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-fg truncate">{a.name}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-fg-faint">
            {a.id}
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide sm:hidden"><span aria-hidden="true">·</span><span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[st]}`} aria-hidden="true" />{t(STATE_KEY[st])}</span>
          </span>
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-faint shrink-0 max-w-[45%] text-right">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATE_DOT[st]}`} aria-hidden="true" />{t(STATE_KEY[st])}
        </span>
      </div>
      {usable ? (
        <p className="shrink-0 text-right sm:text-left sm:mt-3 sm:flex sm:items-baseline sm:justify-between sm:gap-2">
          <span className="block text-[16px] sm:text-[18px] font-semibold tabular-nums tracking-tight text-fg">{formatPrice(a.price)}</span>
          {a.changePct != null && <span className={`block text-[12.5px] tabular-nums font-medium ${up ? 'price-up' : 'price-down'}`}>{up ? '+' : '−'}{Math.abs(a.changePct).toFixed(2)}%</span>}
        </p>
      ) : <p className="shrink-0 text-right sm:text-left sm:mt-3 text-[13px] text-fg-faint">{t('landing.scene.noQuote')}</p>}
    </li>
  )
}

export function AssetStrip() {
  const { t } = useI18n()
  const { assets, error } = useAssets()
  const list = assets ? pick(assets) : null
  return (
    <section aria-labelledby="glance-title" className="border-b border-ink-700" data-asset-strip>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h2 id="glance-title" className="text-[15px] font-semibold text-fg">{t('landing.ex.assetsTitle')}</h2>
            <p className="text-[12.5px] text-fg-faint">{t('landing.marketsBody')}</p>
          </div>
          <a href="#markets" className="shrink-0 text-[13px] text-accent hover:underline underline-offset-4">{t('landing.ex.assetsAll')} →</a>
        </div>
        {list && list.length > 0 ? (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">{list.map(a => <AssetCard key={a.id} a={a} failed={error} />)}</ul>
        ) : error || (assets && assets.length === 0) ? (
          <p className="ex-asset text-[13.5px] text-fg-muted" role="status">{t('landing.ex.assetsDown')}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3" aria-busy="true" aria-label={t('status.connecting')}>
            {[0, 1, 2, 3].map(i => <li key={i} className="ex-asset h-[64px] sm:h-[104px] skeleton-sheen" />)}
          </ul>
        )}
      </div>
    </section>
  )
}

/* Automation, described as it works (signed-in feature; nothing simulated). */
const AUTO: { title: TKey; body: TKey }[] = [
  { title: 'landing.ex.a1Title', body: 'landing.ex.a1Body' },
  { title: 'landing.ex.a2Title', body: 'landing.ex.a2Body' },
  { title: 'landing.ex.a3Title', body: 'landing.ex.a3Body' },
]
export function AutomationSection() {
  const { t } = useI18n()
  return (
    <section id="automation" aria-labelledby="automation-title" className="scroll-mt-16 border-b border-ink-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
        <div>
          <p className="ex-eyebrow">{t('landing.ex.autoEyebrow')}</p>
          <h2 id="automation-title" className="ex-h2">{t('landing.ex.autoTitle')}</h2>
          <p className="mt-4 text-fg-muted leading-relaxed max-w-lg">{t('landing.ex.autoBody')}</p>
          <p className="mt-5 text-[13px] text-fg-faint">{t('landing.ex.autoNote')}</p>
          <Link href="/sign-up" className="btn btn-solid mt-6 inline-flex">{t('common.openAccount')}</Link>
        </div>
        <ol className="ex-rows">
          {AUTO.map((s, i) => (
            <li key={s.title} className="ex-row">
              <span className="ex-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold text-fg">{t(s.title)}</h3>
                <p className="mt-1 text-[14.5px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

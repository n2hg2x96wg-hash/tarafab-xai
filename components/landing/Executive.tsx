'use client'

// Public landing page building blocks (Executive Bitcoin, after the approved
// mockup). Every figure comes from the existing market feeds; while a feed is
// connecting, delayed or down, the component says so instead of showing a
// number. The hero photograph is an original 3D render (public/landing;
// scene and how to re-render it in design/landing).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAssets } from '@/components/markets/assetStore'
import { effectiveState } from '@/lib/marketStatus'
import { formatPrice, type AssetQuote } from '@/lib/assets'
import { IconChart, IconCheck, IconLock, IconSliders } from '@/components/Icons'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

/* Hero ------------------------------------------------------------------ */
/* Always dark (it sits on a photograph), so its text uses fixed colours:
   the theme's "white" token follows the theme. */
const FEATURES: { icon: typeof IconChart; title: TKey; sub: TKey }[] = [
  { icon: IconLock, title: 'trust.access', sub: 'trust.accessSub' },
  { icon: IconSliders, title: 'landing.ex.autoEyebrow', sub: 'landing.ex.a2Title' },
  { icon: IconChart, title: 'landing.cap.marketTitle', sub: 'landing.ex.b1Sub' },
  { icon: IconCheck, title: 'trust.review', sub: 'trust.reviewSub' },
]

export function Hero() {
  const { t } = useI18n()
  return (
    <section className="ex-hero relative overflow-hidden pt-16 text-[#fff]" aria-labelledby="hero-title" data-hero>
      {/* Photograph: full-bleed from tablet up; on phones it follows the actions. */}
      <picture className="absolute inset-0 hidden md:block" aria-hidden="true">
        <img src="/landing/hero-bitcoin-wide-1600.webp" srcSet="/landing/hero-bitcoin-wide-1600.webp 1600w, /landing/hero-bitcoin-wide.webp 2560w" sizes="100vw"
          alt="" width={2560} height={1280} className="h-full w-full object-cover object-[72%_50%]" decoding="async" fetchPriority="high" />
      </picture>
      <div className="ex-hero-shade absolute inset-0 hidden md:block" aria-hidden="true" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10 md:pt-16 md:pb-36 lg:pt-20 lg:pb-36">
        <div className="max-w-[600px] lg:max-w-[700px]">
          <p className="rise-in ex-hero-pill" style={{ ['--i' as string]: 0 }}>
            {(['trust.review', 'trust.audit', 'trust.access'] as TKey[]).map((k, i) => (
              <span key={k} className="inline-flex items-center gap-2">{i > 0 && <span className="ex-hero-pill-dot" aria-hidden="true" />}{t(k)}</span>
            ))}
          </p>
          {/* Lines break only between words; the fluid size keeps
              "intelligence." whole down to 320px. */}
          <h1 id="hero-title" className="hero-h1 rise-in mt-5 text-[clamp(34px,10vw,52px)] md:text-[52px] lg:text-[56px] xl:text-[60px] leading-[1.06] font-bold tracking-[-0.035em]" style={{ ['--i' as string]: 1 }}>
            {t('landing.heroTitle1')}
            <span className="block ex-gold-text">{t('landing.heroTitle2')}</span>
          </h1>
          <p className="rise-in mt-5 text-[16px] sm:text-[18px] leading-relaxed text-[#d6d1c7] max-w-[540px]" style={{ ['--i' as string]: 2 }}>
            {t('landing.heroBody')}
          </p>
          <div data-hero-cta className="rise-in mt-7 flex flex-col sm:flex-row gap-3" style={{ ['--i' as string]: 3 }}>
            <Link href="/sign-up" className="btn btn-solid ex-btn-lg">{t('common.openAccount')}</Link>
            <Link href="/sign-in" className="btn ex-btn-ghost ex-btn-lg">{t('common.signIn')}</Link>
          </div>
          {/* Phones: clear of the right-hand strip where the support bubble floats. */}
          <p className="rise-in mt-4 text-[13px] leading-relaxed text-[#a39e94] max-w-md pr-14 sm:pr-0" style={{ ['--i' as string]: 4 }} data-hero-risk>
            {t('landing.risk')}
          </p>
        </div>

        {/* Phones: the photograph after the essentials. */}
        <div className="md:hidden mt-7 -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden border-y sm:border border-[#ffffff14]" data-hero-visual>
          <img src="/landing/hero-bitcoin-phone.webp" alt={t('landing.ex.visualAlt')} width={1200} height={900} className="block w-full h-auto" decoding="async" />
        </div>

        <ul className="mt-8 md:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5 max-w-[880px]" data-benefits>
          {FEATURES.map(({ icon: Icon, title, sub }) => (
            <li key={title} className="flex items-start gap-3 min-w-0">
              <span className="ex-hero-icon shrink-0" aria-hidden="true"><Icon width={20} height={20} /></span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-snug">{t(title)}</span>
                <span className="block text-[12.5px] leading-snug text-[#a39e94]">{t(sub)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* Market cards ------------------------------------------------------------ */
const PREFERRED = ['BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'BNB']
const STATE_KEY: Record<string, TKey> = { live: 'status.live', delayed: 'status.delayed', stale: 'status.stale', unavailable: 'status.dataUnavailable' }
const STATE_DOT: Record<string, string> = { live: 'bg-emerald-400', delayed: 'bg-amber-400', stale: 'bg-amber-400', unavailable: 'bg-fg-faint' }
// Recognisable colour per asset (not logos): Bitcoin keeps its own orange.
const COIN: Record<string, [string, string]> = { BTC: ['#f7931a', '₿'], ETH: ['#627eea', 'Ξ'], SOL: ['#8a5cf6', 'S'], XRP: ['#23292f', 'X'], USDT: ['#26a17b', '₮'], BNB: ['#f0b90b', 'B'] }

function pick(assets: AssetQuote[]) {
  return [...assets].sort((a, b) => {
    const ia = PREFERRED.indexOf(a.id), ib = PREFERRED.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a.category === 'crypto' ? -1 : 1) - (b.category === 'crypto' ? -1 : 1)
  }).slice(0, 4)
}

// Real 24-hour history from /api/market/candles (crypto only). Loaded once the
// browser is idle; nothing is drawn when there is no data.
function useDayLine(id: string, enabled: boolean) {
  const [pts, setPts] = useState<number[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const run = () => fetch(`/api/market/candles?id=${encodeURIComponent(id)}&tf=1D`).then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j?.available && Array.isArray(j.points) && j.points.length > 2) setPts(j.points.map((p: [number, number]) => p[1])) }).catch(() => {})
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 800)
    return () => { alive = false }
  }, [id, enabled])
  return pts
}

function Spark({ pts }: { pts: number[] }) {
  const w = 96, h = 34, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-24 h-[34px] shrink-0 ${up ? 'text-emerald-400' : 'text-rose-400'}`} role="img" aria-label="24h price history" data-spark>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="currentColor" fillOpacity=".10" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function AssetCard({ a, failed }: { a: AssetQuote; failed: boolean }) {
  const { t } = useI18n()
  const st = effectiveState(a, failed)
  const usable = a.price != null && st !== 'unavailable'
  const up = (a.changePct ?? 0) >= 0
  const pts = useDayLine(a.id, usable && a.category === 'crypto' && a.chart)
  const [color, glyph] = COIN[a.id] || ['#3b3f47', a.id.slice(0, 1)]
  return (
    <li className="ex-asset" data-asset={a.id} data-state={st}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="ex-coin" style={{ background: color }} aria-hidden="true">{glyph}</span>
        <div className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg truncate">{a.name}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-fg-faint">
            {a.id}<span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide"><span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[st]}`} aria-hidden="true" />{t(STATE_KEY[st])}</span>
          </span>
        </div>
      </div>
      {usable ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[20px] font-semibold tabular-nums tracking-tight text-fg leading-tight">{formatPrice(a.price)}</p>
            {a.changePct != null && <p className={`text-[12.5px] tabular-nums font-medium ${up ? 'price-up' : 'price-down'}`}>{up ? '+' : '−'}{Math.abs(a.changePct).toFixed(2)}% <span className="text-fg-faint font-normal">24h</span></p>}
          </div>
          {pts && <Spark pts={pts} />}
        </div>
      ) : <p className="mt-3 text-[13px] text-fg-faint">{t('landing.scene.noQuote')}</p>}
    </li>
  )
}

export function AssetStrip() {
  const { t } = useI18n()
  const { assets, error } = useAssets()
  const list = assets ? pick(assets) : null
  return (
    <section aria-labelledby="glance-title" className="relative z-10 md:-mt-24 lg:-mt-28 pb-6" data-asset-strip>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 md:pt-0">
        <div className="flex items-end justify-between gap-4 mb-3">
          <h2 id="glance-title" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fg md:text-[#e8e3d8]">{t('landing.ex.assetsTitle')}</h2>
          <a href="#markets" className="shrink-0 text-[13px] text-accent md:text-[rgb(var(--accent))] hover:underline underline-offset-4">{t('landing.ex.assetsAll')} →</a>
        </div>
        {list && list.length > 0 ? (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{list.map(a => <AssetCard key={a.id} a={a} failed={error} />)}</ul>
        ) : error || (assets && assets.length === 0) ? (
          <p className="ex-asset text-[13.5px] text-fg-muted" role="status">{t('landing.ex.assetsDown')}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true" aria-label={t('status.connecting')}>
            {[0, 1, 2, 3].map(i => <li key={i} className="ex-asset h-[100px] skeleton-sheen" />)}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-fg-faint">{t('landing.marketsBody')}</p>
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
        <ol className="grid gap-3">
          {AUTO.map((s, i) => (
            <li key={s.title} className="ex-card flex gap-4">
              <span className="ex-num-badge" aria-hidden="true">{i + 1}</span>
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

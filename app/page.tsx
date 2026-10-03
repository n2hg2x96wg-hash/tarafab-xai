'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { HeroLivePanel, LatestBlocks, LiveTickerBar, useLiveMarket } from '@/components/LiveCrypto'
import { IconArrowDown, IconChart, IconCheck, IconGrid, IconList, IconLock, IconSwap, IconUser, Logo } from '@/components/Icons'
import { FaqSection, HeroFloatPanels, HistorySection, NetworkSection, PlatformStatus, Reveal, TrustBar } from '@/components/LandingExtras'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import LazyOnView, { MountOnView } from '@/components/markets/LazyOnView'
import { MarketSources } from '@/components/markets/MarketSources'
import HashSettle from '@/components/landing/HashSettle'
import { useTheme } from '@/lib/theme/ThemeProvider'

// Decorative canvas: its code is fetched only once the browser is idle, so it
// never competes with the page becoming interactive.
const AmbientField = dynamic(() => import('@/components/AmbientField').then(m => m.AmbientField), { ssr: false })

function TradingViewWidget() {
  const ref = useRef<HTMLDivElement>(null)
  const { resolved } = useTheme()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'COINBASE:BTCUSD',
      interval: '60',
      timezone: 'Etc/UTC',
      theme: resolved,
      style: '1',
      locale: tvLocale(),
      backgroundColor: resolved === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(13, 16, 22, 1)',
      gridColor: resolved === 'light' ? 'rgba(16, 21, 30, 0.06)' : 'rgba(255, 255, 255, 0.04)',
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
    })
    el.appendChild(script)
    return () => { el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' }
  }, [resolved])
  return (
    <div className="tradingview-widget-container h-[420px] sm:h-[480px]" ref={ref}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

// Decorative line behind the hero. It is an abstract wave, not price data:
// no axis, no values, and it never changes with the market. Two identical
// periods are drawn so the slow horizontal drift loops without a seam.
const HERO_WAVE = (() => {
  const period = 1600, h = 180, pts: string[] = []
  for (let x = 0; x <= period * 2; x += 20) {
    const u = (x % period) / period * Math.PI * 2
    const y = h * 0.55 - Math.sin(u) * 26 - Math.sin(u * 3 + 1.2) * 12 - Math.sin(u * 7 + .4) * 5
    pts.push(`${x},${y.toFixed(1)}`)
  }
  return `M${pts.join(' L')}`
})()

// TradingView reads the language from the page so its labels match.
function tvLocale() {
  const l = typeof document !== 'undefined' ? document.documentElement.lang : 'en'
  // TradingView's own code for Korean is "kr", not the ISO "ko".
  if (l === 'ko') return 'kr'
  return ['en', 'fr', 'es', 'de', 'pt', 'it'].includes(l) ? l : 'en'
}

// The overall account and investment workflow, shown under "How it works".
// The deposit-specific steps below stay separate, under "How deposits work".
const workflow: { title: TKey; body: TKey }[] = [
  { title: 'landing.flow.f1Title', body: 'landing.flow.f1Body' },
  { title: 'landing.flow.f2Title', body: 'landing.flow.f2Body' },
  { title: 'landing.flow.f3Title', body: 'landing.flow.f3Body' },
  { title: 'landing.flow.f4Title', body: 'landing.flow.f4Body' },
  { title: 'landing.flow.f5Title', body: 'landing.flow.f5Body' },
  { title: 'landing.flow.f6Title', body: 'landing.flow.f6Body' },
]

const steps: { title: TKey; body: TKey }[] = [
  { title: 'landing.steps.s1Title', body: 'landing.steps.s1Body' },
  { title: 'landing.steps.s2Title', body: 'landing.steps.s2Body' },
  { title: 'landing.steps.s3Title', body: 'landing.steps.s3Body' },
  { title: 'landing.steps.s4Title', body: 'landing.steps.s4Body' },
]

const capabilities: { icon: typeof IconChart; title: TKey; body: TKey }[] = [
  { icon: IconChart, title: 'landing.cap.portfolioTitle', body: 'landing.cap.portfolioBody' },
  { icon: IconArrowDown, title: 'landing.cap.depositTitle', body: 'landing.cap.depositBody' },
  { icon: IconGrid, title: 'landing.cap.manageTitle', body: 'landing.cap.manageBody' },
  { icon: IconSwap, title: 'landing.cap.marketTitle', body: 'landing.cap.marketBody' },
  { icon: IconList, title: 'landing.cap.historyTitle', body: 'landing.cap.historyBody' },
  { icon: IconUser, title: 'landing.cap.activityTitle', body: 'landing.cap.activityBody' },
  { icon: IconLock, title: 'landing.cap.securityTitle', body: 'landing.cap.securityBody' },
  { icon: IconCheck, title: 'landing.cap.auditTitle', body: 'landing.cap.auditBody' },
]

const safeguards: TKey[] = [
  'landing.safeguards.g1', 'landing.safeguards.g2', 'landing.safeguards.g3', 'landing.safeguards.g4', 'landing.safeguards.g5',
]

const loadIntelligence = () => import('@/components/markets/LandingMarkets')
const loadPricing = () => import('@/components/premium/LandingPricing')
const loadStory = () => import('@/components/landing/ScrollStory')

export default function LandingPage() {
  const router = useRouter()
  const market = useLiveMarket()
  const [ambient, setAmbient] = useState(false)
  const [adminSession, setAdminSession] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    if (w.requestIdleCallback) { const h = w.requestIdleCallback(() => setAmbient(true), { timeout: 2500 }); return () => w.cancelIdleCallback?.(h) }
    const t = setTimeout(() => setAmbient(true), 1200); return () => clearTimeout(t)
  }, [])
  const { t, locale } = useI18n()

  // A signed-in CLIENT is sent to their dashboard. A signed-in ADMIN is not
  // redirected: the public site is a legitimate place for an admin to be, and
  // a session alone must never decide where they land. They get a link to the
  // admin dashboard instead (see adminSession below). The role always comes
  // from the profile record, never from the mere existence of a session.
  // The Supabase client is
  // loaded on demand rather than imported at the top of this file: it is a
  // large library, and including it in the landing page bundle delayed the
  // point at which the menu and other buttons became clickable by seconds on
  // a phone. Nothing on this page needs it to render, so it is fetched after
  // the browser is idle, once the page is already interactive.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        if (cancelled) return
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled || !session) return
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single() as { data: { role?: string } | null }
        if (cancelled) return
        if (profile?.role === 'admin') setAdminSession(true)
        else if (profile?.role === 'customer') router.replace('/dashboard')
      } catch { /* not signed in, or offline: the landing page is what they see */ }
    }
    // requestIdleCallback is missing on older Safari, so fall back to a timer.
    const hasIdle = typeof window.requestIdleCallback === 'function'
    const handle = hasIdle ? window.requestIdleCallback(check, { timeout: 1500 }) : window.setTimeout(check, 200)
    return () => {
      cancelled = true
      if (hasIdle) window.cancelIdleCallback?.(handle as number)
      else clearTimeout(handle as number)
    }
  }, [router])

  return (
    <div className="site min-h-screen bg-ink-950 text-fg">
      <HashSettle />
      <Navbar />
      {adminSession && (
        <div className="fixed top-16 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
          <Link href="/admin" className="pointer-events-auto mt-2 inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900/90 backdrop-blur px-4 py-2 text-[13px] text-fg-muted hover:text-fg shadow-lg">
            {t('landing.adminBar')}
          </Link>
        </div>
      )}

      <div className="pt-16">
        <ErrorBoundary label={t('trust.marketData')}><LiveTickerBar /></ErrorBoundary>
      </div>

      {/* Hero */}
      <section className="relative border-b border-ink-700 overflow-hidden">
        {/* Decorative layer, capped to the hero banner's own height. On
            phones the two grid columns below stack vertically, which makes
            this section much taller than the banner it is meant to sit
            behind; without a cap the node network and price wave spread
            across that extra height and strand isolated marks over
            unrelated content (e.g. just under the sign-in button).
            760px approximates the stacked badge+title+body+CTAs+risk text
            column on a phone; it only needs to roughly bound the banner, not
            match it exactly, since the network/wave are a diffuse texture
            rather than content that must align to a pixel. Reverts to the
            full section (`lg:inset-0 lg:h-auto`) once the grid is
            side-by-side and the section height already matches the banner. */}
        <div className="absolute inset-x-0 top-0 h-[760px] lg:inset-0 lg:h-auto overflow-hidden" aria-hidden="true">
          <div className="hero-light" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          {ambient && <AmbientField className="opacity-90" />}
          <HeroFloatPanels
            live={market.status === 'live' || market.status === 'polling'}
            price={market.quotes['BTC-USD']?.price}
            change={market.quotes['BTC-USD']?.open24h ? ((market.quotes['BTC-USD']!.price / market.quotes['BTC-USD']!.open24h) - 1) * 100 : undefined}
          />
          <div className="market-line hidden lg:block" aria-hidden="true">
            <svg viewBox="0 0 3200 180" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroWave" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity=".22" />
                  <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${HERO_WAVE} L3200,180 L0,180 Z`} fill="url(#heroWave)" />
              <path d={HERO_WAVE} fill="none" stroke="rgb(var(--accent))" strokeOpacity=".45" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-14 lg:pt-20 lg:pb-20 grid lg:grid-cols-[1.08fr_1fr] gap-10 lg:gap-12 items-center">
          <div>
            <div className="rise-in inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900/70 px-3 py-1 text-[12px] text-fg-muted mb-6 backdrop-blur-sm" style={{ ['--i' as string]: 0 }}>
              <span className="relative flex w-1.5 h-1.5">
                {market.status === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
                <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${market.status === 'live' ? 'bg-emerald-400' : 'bg-fg-faint'}`} />
              </span>
              {t('landing.badge')}
            </div>
            <h1 className="rise-in text-[38px] sm:text-[52px] lg:text-[60px] leading-[1.04] [overflow-wrap:anywhere] [hyphens:auto] font-semibold tracking-[-0.035em] text-fg" style={{ ['--i' as string]: 1 }}>
              {t('landing.heroTitle1')}
              <span className="block text-accent-sheen">{t('landing.heroTitle2')}</span>
            </h1>
            <p className="rise-in mt-6 text-[17px] sm:text-lg text-fg-muted leading-relaxed max-w-xl" style={{ ['--i' as string]: 2 }}>
              {t('landing.heroBody')}
            </p>
            <div className="rise-in mt-8 flex flex-col sm:flex-row gap-3" style={{ ['--i' as string]: 3 }}>
              <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
              <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
            </div>
            <p className="rise-in mt-5 text-[13px] text-fg-faint max-w-md leading-relaxed" style={{ ['--i' as string]: 4 }}>
              {t('landing.risk')}
            </p>
            <div className="rise-in mt-8" style={{ ['--i' as string]: 5 }}>
              <TrustBar marketStatus={market.status} />
            </div>
            <div className="rise-in mt-5" style={{ ['--i' as string]: 6 }}>
              <PlatformStatus marketStatus={market.status} />
            </div>
          </div>

          <div className="relative rise-in" style={{ ['--i' as string]: 3 }}>
            <div className="absolute -inset-4 rounded-2xl bg-gradient-to-b from-accent/10 via-transparent to-transparent blur-2xl" aria-hidden="true" />
            <div className="relative">
              <ErrorBoundary label={t('market.bitcoinMarket')}><HeroLivePanel {...market} /></ErrorBoundary>
            </div>
          </div>
        </div>
      </section>

      {/* What the platform does */}
      <LazyOnView load={loadIntelligence} />

      {/* Scroll-driven story: code fetched when the browser is idle, mounted near the viewport */}
      <LazyOnView load={loadStory} minHeight={640} />

      <section id="platform" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
          <Reveal><div className="mb-10 max-w-2xl">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent mb-3">{t('landing.platformEyebrow')}</p>
            <h2 className="text-3xl sm:text-[34px] font-semibold tracking-tight text-fg">{t('landing.platformTitle')}</h2>
            <p className="mt-3 text-fg-muted leading-relaxed">{t('landing.platformBody')}</p>
          </div></Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {capabilities.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 4) * 70} className="h-full">
                <div className="panel panel-lift p-5 h-full">
                  <span className="icon-tile mb-4"><Icon width={19} height={19} /></span>
                  <h3 className="text-[16px] font-semibold text-fg mb-1.5">{t(title)}</h3>
                  <p className="text-[14px] text-fg-muted leading-relaxed">{t(body)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Markets */}
      <section id="markets" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <Reveal><div className="mb-8 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">{t('landing.marketsTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.marketsBody')}</p>
          </div></Reveal>

          {/* The TradingView embed is a heavy third-party iframe: it is only
              requested once the visitor scrolls near it. */}
          <MountOnView className="mb-4 min-h-[466px] sm:min-h-[526px]">
            <Reveal><div className="panel overflow-hidden mb-4">
              <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
                <span className="text-fg">BTC/USD</span>
                <span className="text-fg-faint">{t('landing.livePrice')}</span>
              </div>
              <ErrorBoundary label={t('landing.livePrice')}><TradingViewWidget key={locale} /></ErrorBoundary>
            </div></Reveal>
          </MountOnView>

          <MountOnView className="min-h-[434px] lg:min-h-[278px]">
            <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
              <Reveal className="h-full"><ErrorBoundary label={t('market.bitcoinMarket')}><BitcoinMarketCard /></ErrorBoundary></Reveal>
              <Reveal delay={100}><ErrorBoundary label={t('market.blocksTitle')}><LatestBlocks /></ErrorBoundary></Reveal>
            </div>
          </MountOnView>
          <MarketSources sources={['Coinbase Exchange', 'CoinGecko', 'mempool.space', 'TradingView chart']} className="mt-3 px-1" />
        </div>
      </section>

      <MountOnView className="max-w-6xl mx-4 sm:mx-6 lg:mx-auto my-8 min-h-[1200px] lg:min-h-[760px]">
        <ErrorBoundary label={t('market.historyTitle')} className="max-w-6xl mx-4 sm:mx-auto my-8"><HistorySection price={market.quotes['BTC-USD']?.price} /></ErrorBoundary>
      </MountOnView>

      <MountOnView className="max-w-6xl mx-4 sm:mx-6 lg:mx-auto my-8 min-h-[680px] lg:min-h-[330px]">
        <ErrorBoundary label={t('network.title')} className="max-w-6xl mx-4 sm:mx-auto my-8"><NetworkSection /></ErrorBoundary>
      </MountOnView>

      {/* How it works: the overall account and investment workflow */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <Reveal><div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">{t('landing.workflowTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.workflowBody')}</p>
          </div></Reveal>
          <Reveal><ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
            {workflow.map((s, i) => (
              <li key={s.title} className="bg-ink-950 p-6">
                <div className="text-[13px] text-accent font-medium tabular-nums mb-3">{t('landing.step', { n: i + 1 })}</div>
                <h3 className="text-[17px] font-semibold text-fg mb-2">{t(s.title)}</h3>
                <p className="text-[15px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </li>
            ))}
          </ol></Reveal>
          <Reveal><p className="mt-6 text-[13px] text-fg-faint max-w-3xl">{t('landing.workflowNote')}</p></Reveal>
        </div>
      </section>

      {/* How deposits work: funding specifically */}
      <section id="how-deposits-work" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <Reveal><div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">{t('landing.howTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.howBody')}</p>
          </div></Reveal>
          <Reveal><ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-ink-950 p-6">
                <div className="text-[13px] text-accent font-medium tabular-nums mb-3">{t('landing.step', { n: i + 1 })}</div>
                <h3 className="text-[17px] font-semibold text-fg mb-2">{t(s.title)}</h3>
                <p className="text-[15px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </li>
            ))}
          </ol></Reveal>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-[1fr_1.4fr] gap-10">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-fg">{t('landing.securityTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.securityBody')}</p>
          </Reveal>
          <Reveal delay={100}><ul className="divide-y divide-ink-700 border-y border-ink-700">
            {safeguards.map(item => (
              <li key={item} className="flex gap-3 py-4">
                <IconCheck className="shrink-0 mt-0.5 text-accent" />
                <span className="text-[15px] text-fg-muted leading-relaxed">{t(item)}</span>
              </li>
            ))}
          </ul></Reveal>
        </div>
      </section>

      <FaqSection />

      {/* Closing */}
      <section className="border-b border-ink-700">
        <Reveal><div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-fg">{t('common.openAccount')}</h2>
            <p className="mt-2 text-fg-muted">{t('landing.closingBody')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/sign-up" className="btn btn-solid">{t('common.openAccount')}</Link>
            <Link href="/sign-in" className="btn btn-outline">{t('common.signIn')}</Link>
          </div>
        </div></Reveal>
      </section>

      <LazyOnView load={loadPricing} minHeight={0} />
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 chat-clearance">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo />
            <p className="mt-3 text-sm text-fg-muted max-w-xs">{t('landing.footer.tagline')}</p>
            <p className="mt-3 text-[12.5px] text-fg-faint max-w-sm leading-relaxed">{t('landing.footerRisk')}</p>
          </div>
          {([
            ['landing.footer.platform', [['#platform', 'nav.platform'], ['#how-it-works', 'nav.howItWorks'], ['#markets', 'nav.markets'], ['/investments', 'landing.footer.investments'], ['#security', 'nav.security']]],
            ['landing.footer.account', [['/sign-in', 'common.signIn'], ['/sign-up', 'common.openAccount'], ['/forgot-password', 'nav.resetPassword'], ['#how-deposits-work', 'nav.howDeposits']]],
            ['landing.footer.support', [['#faq', 'nav.faq'], ['/dashboard#support', 'landing.footer.help']]],
          ] as [TKey, [string, TKey][]][]).map(([title, links]) => (
            <nav key={title} aria-label={t(title)}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-faint mb-3">{t(title)}</p>
              <ul className="space-y-2 text-sm">
                {links.map(([href, label]) => (
                  <li key={href}>{href.startsWith('#')
                    ? <a href={href} className="text-fg-muted hover:text-fg transition-colors">{t(label)}</a>
                    : <Link href={href} className="text-fg-muted hover:text-fg transition-colors">{t(label)}</Link>}</li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-ink-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-fg-faint">
          <p>&copy; {new Date().getFullYear()} Tarafab.XAi</p>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { HeroLivePanel, LatestBlocks, LiveTickerBar, useLiveMarket } from '@/components/LiveCrypto'
import { IconArrowDown, IconChart, IconCheck, IconGrid, IconList, IconLock, IconSwap, IconUser, Logo } from '@/components/Icons'
import { FaqSection, HistorySection, NetworkSection, Reveal, TrustBar } from '@/components/LandingExtras'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { useTheme } from '@/lib/theme/ThemeProvider'

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

// TradingView reads the language from the page so its labels match.
function tvLocale() {
  const l = typeof document !== 'undefined' ? document.documentElement.lang : 'en'
  return ['en', 'fr', 'es', 'de', 'pt', 'it'].includes(l) ? l : 'en'
}

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

export default function LandingPage() {
  const router = useRouter()
  const market = useLiveMarket()
  const { t, locale } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single() as { data: { role?: string } | null }
      router.replace(profile?.role === 'admin' ? '/admin' : '/dashboard')
    }).catch(() => {})
  }, [router])

  return (
    <div className="site min-h-screen bg-ink-950 text-fg">
      <Navbar />

      <div className="pt-16">
        <LiveTickerBar quotes={market.quotes} />
      </div>

      {/* Hero */}
      <section className="relative border-b border-ink-700 overflow-hidden">
        <div className="hero-light" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-14 lg:pt-20 lg:pb-20 grid lg:grid-cols-[1.08fr_1fr] gap-10 lg:gap-12 items-center">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-md border border-ink-600 bg-ink-900/70 px-2.5 py-1 text-[12px] text-fg-muted mb-6 backdrop-blur-sm">
              <span className="relative flex w-1.5 h-1.5">
                {market.status === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
                <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${market.status === 'live' ? 'bg-emerald-400' : 'bg-fg-faint'}`} />
              </span>
              {t('landing.badge')}
            </div>
            <h1 className="text-[38px] sm:text-[52px] lg:text-[60px] leading-[1.04] [overflow-wrap:anywhere] [hyphens:auto] font-semibold tracking-[-0.03em] text-fg">
              {t('landing.heroTitle1')}
              <span className="block text-accent">{t('landing.heroTitle2')}</span>
            </h1>
            <p className="mt-6 text-[17px] sm:text-lg text-fg-muted leading-relaxed max-w-xl">
              {t('landing.heroBody')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
              <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
            </div>
            <p className="mt-5 text-[13px] text-fg-faint max-w-md leading-relaxed">
              {t('landing.risk')}
            </p>
            <div className="mt-8">
              <TrustBar marketStatus={market.status} />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-2xl bg-gradient-to-b from-accent/10 via-transparent to-transparent blur-2xl" aria-hidden="true" />
            <div className="relative">
              <HeroLivePanel {...market} />
            </div>
          </div>
        </div>
      </section>

      {/* What the platform does */}
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

          <Reveal><div className="panel overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
              <span className="text-fg">BTC/USD</span>
              <span className="text-fg-faint">{t('landing.livePrice')}</span>
            </div>
            <TradingViewWidget key={locale} />
          </div></Reveal>

          <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
            <Reveal className="h-full"><BitcoinMarketCard /></Reveal>
            <Reveal delay={100}><LatestBlocks /></Reveal>
          </div>
        </div>
      </section>

      <HistorySection price={market.quotes['BTC-USD']?.price} />

      <NetworkSection />

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-ink-700">
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

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 chat-clearance">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <Logo />
            <p className="mt-3 text-[13px] text-fg-faint max-w-sm">
              {t('landing.footerRisk')}
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-2 text-sm">
            <a href="#platform" className="text-fg-muted hover:text-fg">{t('nav.platform')}</a>
            <a href="#markets" className="text-fg-muted hover:text-fg">{t('nav.markets')}</a>
            <Link href="/sign-in" className="text-fg-muted hover:text-fg">{t('common.signIn')}</Link>
            <a href="#how-it-works" className="text-fg-muted hover:text-fg">{t('nav.howItWorks')}</a>
            <Link href="/sign-up" className="text-fg-muted hover:text-fg">{t('common.openAccount')}</Link>
            <a href="#security" className="text-fg-muted hover:text-fg">{t('nav.security')}</a>
            <Link href="/forgot-password" className="text-fg-muted hover:text-fg">{t('nav.resetPassword')}</Link>
            <a href="#faq" className="text-fg-muted hover:text-fg">{t('nav.faq')}</a>
          </nav>
        </div>
        <div className="mt-10 pt-6 border-t border-ink-700 flex flex-col sm:flex-row sm:justify-between gap-2 text-xs text-fg-faint">
          <p>&copy; {new Date().getFullYear()} Tarafab.XAi</p>
          <p>{t('sources.title')}: Coinbase Exchange · CoinGecko · mempool.space · TradingView</p>
        </div>
      </footer>
    </div>
  )
}

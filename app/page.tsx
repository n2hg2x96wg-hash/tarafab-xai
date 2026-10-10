'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { LiveTickerBar, useLiveMarket } from '@/components/LiveCrypto'
import { IconArrowDown, IconChart, IconCheck, IconGrid, IconList, IconLock, IconSwap, IconUser, Logo } from '@/components/Icons'
import { FaqSection, HeroFloatPanels, Reveal, TrustBar } from '@/components/LandingExtras'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import LazyOnView from '@/components/markets/LazyOnView'
import HashSettle from '@/components/landing/HashSettle'
import HeroScene from '@/components/landing/HeroScene'

// Decorative canvas: its code is fetched only once the browser is idle, so it
// never competes with the page becoming interactive.
const BitcoinGrowth3D = dynamic(() => import('@/components/three/BitcoinGrowth3D'), { ssr: false })
const AmbientField = dynamic(() => import('@/components/AmbientField').then(m => m.AmbientField), { ssr: false })


// The overall account and investment workflow, shown under "How it works".
// The deposit-specific steps below stay separate, under "How deposits work".
const workflow: { title: TKey; body: TKey }[] = [
  { title: 'landing.flow.f1Title', body: 'landing.flow.f1Body' },
  { title: 'landing.flow.f2Title', body: 'landing.flow.f2Body' },
  { title: 'landing.flow.f3Title', body: 'landing.flow.f3Body' },
  { title: 'landing.flow.f4Title', body: 'landing.flow.f4Body' },
  { title: 'landing.flow.fAiTitle', body: 'landing.flow.fAiBody' },
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

// The public page shows four account capabilities; the full list is what
// clients use in the dashboard.
const PUBLIC_CAPS: TKey[] = ['landing.cap.portfolioTitle', 'landing.cap.depositTitle', 'landing.cap.historyTitle', 'landing.cap.securityTitle']

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
  const { t } = useI18n()
  // Live 3D Bitcoin behind the hero: above the price card in the right-hand
  // column on desktop; on phones, top right behind the headline.
  const heroRef = useRef<HTMLElement>(null)
  const decorRef = useRef<HTMLDivElement>(null)
  const coinSlot = useRef<HTMLDivElement>(null)
  const placeCoin = useCallback((w: number, h: number) => {
    const d = decorRef.current?.getBoundingClientRect(), c = coinSlot.current?.getBoundingClientRect()
    if (d && c && c.width > 0 && c.height > 0) {
      if (w < 1024) {
        // phones and tablets: the coin floats above the price card, the line
        // rising from the lower left behind the card
        const size = Math.min(c.height * 0.86, w * 0.56, 240)
        const x = c.left - d.left + c.width / 2, y = c.top - d.top + c.height / 2
        return { x, y, size, lineFrom: { x: 0, y: c.bottom - d.top + 150 }, lineTo: { x: x + size * 0.6, y: y - size * 0.38 } }
      }
      const size = Math.min(c.width * 0.62, c.height * 0.8, 360)
      // the growth line rises within the right-hand column only
      const x = c.left - d.left + c.width / 2, y = c.top - d.top + size * 0.55 + 8
      // the growth line rises across the right-hand column only, behind the
      // price card and the coin, ending just above the coin's right shoulder
      return { x, y, size, lineFrom: { x: c.left - d.left - 40, y: h * 0.985 }, lineTo: { x: x + size * 0.62, y: y - size * 0.42 } }
    }
    // before the layout is measured: keep it off the headline
    const size = Math.min(w * 0.5, 220)
    return { x: w / 2, y: h - size, size, noLine: true }
  }, [])

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
    <div className="site lp min-h-screen bg-ink-950 text-fg">
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
      <section ref={heroRef} className="relative border-b border-ink-700 overflow-hidden">
        {/* Decorative layer behind the whole hero: light, grid, the gold
            backdrop and the live 3D coin. The coin is placed from the
            right-hand column's slot (desktop: beside the copy; phones: above
            the price card, after the copy), so it never sits on the text. */}
        <div ref={decorRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="hero-light" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          {/* Warm rock bed and bokeh behind the live coin (dark theme). */}
          <div className="hero-backdrop" aria-hidden="true" />
          {ambient && <BitcoinGrowth3D variant="hero" place={placeCoin} scrollRef={heroRef} className="hero-btc3d" fallback={<AmbientField className="opacity-90" />} />}
          <HeroFloatPanels
            live={market.status === 'live' || market.status === 'polling'}
            price={market.quotes['BTC-USD']?.price}
            change={market.quotes['BTC-USD']?.open24h ? ((market.quotes['BTC-USD']!.price / market.quotes['BTC-USD']!.open24h) - 1) * 100 : undefined}
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 sm:pt-12 lg:pt-20 lg:pb-20 grid lg:grid-cols-[1.08fr_1fr] gap-12 lg:gap-12 items-center">
          <div>
            <div className="rise-in inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900/70 px-3 py-1 text-[12px] text-fg-muted mb-5 backdrop-blur-sm" style={{ ['--i' as string]: 0 }}>
              <span className="relative flex w-1.5 h-1.5">
                {market.status === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
                <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${market.status === 'live' ? 'bg-emerald-400' : 'bg-fg-faint'}`} />
              </span>
              {t('landing.badge')}
            </div>
            {/* Words never break: no hyphenation, normal wrapping, balanced lines.
                The fluid size keeps the longest word ("intelligence.") whole
                down to 320px; lines break only between words. */}
            <h1 className="hero-h1 rise-in text-[clamp(30px,10.6vw,54px)] sm:text-[56px] lg:text-[46px] xl:text-[54px] leading-[1.05] font-semibold tracking-[-0.035em] text-fg" style={{ ['--i' as string]: 1 }}>
              {t('landing.growTitle1')}
              <span className="block text-accent-sheen">{t('landing.growTitle2')}</span>
            </h1>
            <p className="rise-in mt-4 sm:mt-6 text-[16px] sm:text-lg text-fg-muted leading-relaxed max-w-xl" style={{ ['--i' as string]: 2 }}>
              {t('landing.growBody')}
            </p>
            <div data-hero-cta className="rise-in mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3" style={{ ['--i' as string]: 3 }}>
              <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
              <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
            </div>
            <p className="rise-in mt-4 sm:mt-5 text-[13px] text-fg-faint max-w-md leading-relaxed pr-14 sm:pr-0" style={{ ['--i' as string]: 4 }}>
              {t('landing.risk')}
            </p>
 {/* Phones: the disclosure and assurances keep clear of the right-hand
                strip where the support bubble floats (pr-14). */}
            {/* Three plain assurances; no backend status or technical metadata. */}
            <div className="rise-in mt-5 sm:mt-8 pr-14 sm:pr-0" style={{ ['--i' as string]: 5 }}>
              <TrustBar minimal />
            </div>
          </div>

          {/* Right column: room for the 3D coin (drawn by the layer behind),
              with the live BTC price card beneath it. */}
          <div className="relative rise-in lg:min-h-[500px] flex flex-col justify-end" style={{ ['--i' as string]: 3 }}>
            <div ref={coinSlot} className="h-[250px] lg:h-auto lg:flex-1 lg:min-h-[320px]" aria-hidden="true" />
            <div className="relative mx-auto w-full max-w-[320px]">
              <ErrorBoundary label={t('market.bitcoinMarket')}><HeroScene market={market} compact /></ErrorBoundary>
            </div>
          </div>
        </div>
      </section>

      {/* What the platform does day to day, right under the hero. */}
      <section className="intro-glow relative overflow-hidden border-b border-ink-700" aria-labelledby="intro-title" data-landing-intro>
        <div className="relative lp-wrap lp-pad grid lg:grid-cols-[1.1fr_1fr] gap-5 lg:gap-12 items-end">
          <h2 id="intro-title" className="text-[clamp(28px,8.4vw,46px)] leading-[1.08] font-semibold tracking-[-0.03em] text-fg [overflow-wrap:normal] [word-break:normal]">
            {t('landing.heroTitle1')} <span className="text-accent-sheen">{t('landing.heroTitle2')}</span>
          </h2>
          <p className="text-[16px] sm:text-lg text-fg-muted leading-relaxed max-w-xl">{t('landing.heroBody')}</p>
        </div>
      </section>

      {/* The product story, told in 3D as the visitor scrolls (code fetched when idle, mounted near the viewport). */}
      <LazyOnView load={loadStory} minHeight={640} />

      {/* Markets: the real market board and a clean price-history chart. */}
      <LazyOnView load={loadIntelligence} id="markets" />

      {/* Intelligent automation: the engine's real status and activity. */}

      <section id="platform" className="lp-section scroll-mt-16 border-b border-ink-700">
        <div className="lp-wrap">
          <Reveal><div className="mb-8 lg:mb-10 max-w-2xl">
            <p className="lp-eyebrow">{t('landing.platformEyebrow')}</p>
            <h2 className="lp-h2">{t('landing.platformTitle')}</h2>
            <p className="lp-lead">{t('landing.platformBody')}</p>
          </div></Reveal>
          <div className="grid sm:grid-cols-2 gap-3 max-w-4xl">
            {capabilities.filter(c => PUBLIC_CAPS.includes(c.title)).map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 4) * 70} className="h-full">
                <div className="panel panel-lift p-4 sm:p-5 h-full flex gap-4 sm:block">
                  <span className="icon-tile shrink-0 sm:mb-4"><Icon width={19} height={19} /></span>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold text-fg mb-1">{t(title)}</h3>
                    <p className="text-[14px] text-fg-muted leading-relaxed">{t(body)}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: the overall account and investment workflow */}
      <section id="how-it-works" className="lp-section scroll-mt-16 border-b border-ink-700">
        <div className="lp-wrap">
          <Reveal><div className="mb-8 lg:mb-10 max-w-2xl">
            <h2 className="lp-h2 !mt-0">{t('landing.workflowTitle')}</h2>
            <p className="lp-lead">{t('landing.workflowBody')}</p>
          </div></Reveal>
          <Reveal><ol className="lp-steps sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step-n" aria-hidden="true">{i + 1}</span>
                <div className="lp-step-label">{t('landing.step', { n: i + 1 })}</div>
                <h3 className="text-[16.5px] font-semibold text-fg mb-1.5">{t(s.title)}</h3>
                <p className="text-[14.5px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </li>
            ))}
          </ol></Reveal>
          <Reveal><p className="mt-6 text-[13px] text-fg-faint max-w-3xl">{t('landing.workflowNote')}</p></Reveal>
        </div>
      </section>

      {/* How deposits work: funding specifically */}
      <section id="how-deposits-work" className="lp-section scroll-mt-16 border-b border-ink-700">
        <div className="lp-wrap">
          <Reveal><div className="mb-8 lg:mb-10 max-w-2xl">
            <h2 className="lp-h2 !mt-0">{t('landing.howTitle')}</h2>
            <p className="lp-lead">{t('landing.howBody')}</p>
          </div></Reveal>
          <Reveal><ol className="lp-steps sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step-n" aria-hidden="true">{i + 1}</span>
                <div className="lp-step-label">{t('landing.step', { n: i + 1 })}</div>
                <h3 className="text-[16.5px] font-semibold text-fg mb-1.5">{t(s.title)}</h3>
                <p className="text-[14.5px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </li>
            ))}
          </ol></Reveal>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="lp-section scroll-mt-16 border-b border-ink-700">
        <div className="lp-wrap grid lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-10">
          <Reveal>
            <h2 className="lp-h2 !mt-0">{t('landing.securityTitle')}</h2>
            <p className="lp-lead">{t('landing.securityBody')}</p>
          </Reveal>
          <Reveal delay={100}><ul className="divide-y divide-ink-700 border-y border-ink-700">
            {safeguards.map(item => (
              <li key={item} className="flex gap-3 py-3.5">
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
        <Reveal><div className="lp-wrap lp-pad flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="lp-h2 !mt-0">{t('common.openAccount')}</h2>
            <p className="lp-lead !mt-2">{t('landing.closingBody')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
            <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
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

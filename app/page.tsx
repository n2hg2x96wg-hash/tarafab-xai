'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useLiveMarket } from '@/components/LiveCrypto'
import { IconArrowDown, IconChart, IconCheck, IconGrid, IconList, IconLock, IconSwap, IconUser, Logo } from '@/components/Icons'
import { FaqSection, Reveal } from '@/components/LandingExtras'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import LazyOnView from '@/components/markets/LazyOnView'
import HashSettle from '@/components/landing/HashSettle'
import { AssetStrip, AutomationSection, BenefitRow, HeroVisual } from '@/components/landing/Executive'

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

export default function LandingPage() {
  const router = useRouter()
  const market = useLiveMarket()
  const [adminSession, setAdminSession] = useState(false)
  const { t } = useI18n()

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

      {/* Hero: headline, actions and disclosure first; the Bitcoin visual
          follows on phones. Only the image and real quote are decorative. */}
      <section className="relative pt-16 border-b border-ink-700 ex-hero-bg" aria-labelledby="hero-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 lg:pt-16 pb-10 lg:pb-14">
          <div className="grid gap-8 lg:gap-12 lg:grid-cols-[1fr_1.02fr] items-center">
            <div className="min-w-0">
              <ul className="rise-in flex flex-wrap gap-2 mb-5" style={{ ['--i' as string]: 0 }} aria-label={t('landing.badge')}>
                {(['trust.review', 'trust.audit', 'trust.access'] as TKey[]).map(k => <li key={k} className="ex-pill"><span className="ex-pill-dot" aria-hidden="true" />{t(k)}</li>)}
              </ul>
              {/* Lines break only between words (no hyphenation); the fluid size
                  keeps "intelligence." whole down to 320px. */}
              <h1 id="hero-title" className="hero-h1 rise-in text-[clamp(32px,9.6vw,50px)] sm:text-[52px] xl:text-[58px] leading-[1.06] font-semibold tracking-[-0.035em] text-fg" style={{ ['--i' as string]: 1 }}>
                {t('landing.heroTitle1')}
                <span className="block text-accent-sheen">{t('landing.heroTitle2')}</span>
              </h1>
              <p className="rise-in mt-4 sm:mt-5 text-[16px] sm:text-[17px] text-fg-muted leading-relaxed max-w-xl" style={{ ['--i' as string]: 2 }}>
                {t('landing.heroBody')}
              </p>
              <div data-hero-cta className="rise-in mt-6 sm:mt-7 flex flex-col sm:flex-row gap-3" style={{ ['--i' as string]: 3 }}>
                <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
                <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
              </div>
              {/* Phones: clear of the right-hand strip where the support bubble floats. */}
              <p className="rise-in mt-4 text-[13px] text-fg-faint max-w-md leading-relaxed pr-14 sm:pr-0" style={{ ['--i' as string]: 4 }} data-hero-risk>
                {t('landing.risk')}
              </p>
            </div>
            <div className="rise-in min-w-0" style={{ ['--i' as string]: 2 }}>
              <ErrorBoundary label={t('market.bitcoinMarket')}><HeroVisual market={market} /></ErrorBoundary>
            </div>
          </div>
          <div className="mt-10 lg:mt-12 pt-7 border-t border-ink-700">
            <BenefitRow />
          </div>
        </div>
      </section>

      {/* Markets at a glance: real quotes and their state. */}
      <ErrorBoundary label={t('trust.marketData')}><AssetStrip /></ErrorBoundary>

      {/* Markets: the real market board and a clean price-history chart. */}
      <LazyOnView load={loadIntelligence} id="markets" />

      {/* The platform: what an account gives you, as plain rows. */}
      <section id="platform" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 grid gap-8 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <Reveal><div>
            <p className="ex-eyebrow">{t('landing.platformEyebrow')}</p>
            <h2 className="ex-h2">{t('landing.platformTitle')}</h2>
            <p className="mt-4 text-fg-muted leading-relaxed max-w-lg">{t('landing.platformBody')}</p>
          </div></Reveal>
          <ul className="border-t border-ink-700">
            {capabilities.filter(c => PUBLIC_CAPS.includes(c.title)).map(({ icon: Icon, title, body }) => (
              <li key={title} className="ex-feature">
                <span className="ex-icon shrink-0" aria-hidden="true"><Icon width={18} height={18} /></span>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-fg">{t(title)}</h3>
                  <p className="mt-1 text-[14.5px] text-fg-muted leading-relaxed">{t(body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <AutomationSection />

      {/* How it works: the overall account and investment workflow */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <Reveal><div className="mb-8 max-w-2xl">
            <h2 className="ex-h2">{t('landing.workflowTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.workflowBody')}</p>
          </div></Reveal>
          <ol className="grid md:grid-cols-2 md:gap-x-12 border-t border-ink-700 md:border-t-0">
            {workflow.map((s, i) => (
              <li key={s.title} className={`ex-row ${i < 2 ? 'md:border-t md:border-ink-700' : ''}`}>
                <span className="ex-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-fg"><span className="sr-only">{t('landing.step', { n: i + 1 })}: </span>{t(s.title)}</h3>
                  <p className="mt-1 text-[14.5px] text-fg-muted leading-relaxed">{t(s.body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[13px] text-fg-faint max-w-3xl">{t('landing.workflowNote')}</p>
        </div>
      </section>

      {/* How deposits work: funding specifically */}
      <section id="how-deposits-work" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <Reveal><div className="mb-8 max-w-2xl">
            <h2 className="ex-h2">{t('landing.howTitle')}</h2>
            <p className="mt-3 text-fg-muted">{t('landing.howBody')}</p>
          </div></Reveal>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {steps.map((s, i) => (
              <li key={s.title} className="ex-asset !p-5">
                <div className="ex-num mb-2">{t('landing.step', { n: i + 1 })}</div>
                <h3 className="text-[16px] font-semibold text-fg mb-1.5">{t(s.title)}</h3>
                <p className="text-[14px] text-fg-muted leading-relaxed">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Security and limits, stated plainly. */}
      <section id="security" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <div className="ex-band p-6 sm:p-10 grid gap-8 lg:grid-cols-[1fr_1.35fr] lg:gap-14">
            <div>
              <span className="ex-icon mb-4" aria-hidden="true"><IconLock width={18} height={18} /></span>
              <h2 className="ex-h2">{t('landing.securityTitle')}</h2>
              <p className="mt-3 text-fg-muted">{t('landing.securityBody')}</p>
              <p className="mt-6 text-[13px] text-fg-faint leading-relaxed">{t('landing.footerRisk')}</p>
            </div>
            <ul className="divide-y divide-ink-700">
              {safeguards.map(item => (
                <li key={item} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                  <IconCheck className="shrink-0 mt-0.5 text-accent" />
                  <span className="text-[15px] text-fg-muted leading-relaxed">{t(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Plans: the configured plans from /api/plans, only when there are any. */}
      <LazyOnView load={loadPricing} minHeight={0} />

      <FaqSection />

      {/* Closing */}
      <section className="border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <Reveal><div className="ex-band px-6 py-8 sm:px-10 sm:py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-fg">{t('common.openAccount')}</h2>
              <p className="mt-2 text-fg-muted">{t('landing.closingBody')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link href="/sign-up" className="btn btn-solid min-h-12 px-6">{t('common.openAccount')}</Link>
              <Link href="/sign-in" className="btn btn-outline min-h-12 px-6">{t('common.signIn')}</Link>
            </div>
          </div></Reveal>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-14 chat-clearance">
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
                    ? <a href={href} className="inline-block py-0.5 text-fg-muted hover:text-fg transition-colors">{t(label)}</a>
                    : <Link href={href} className="inline-block py-0.5 text-fg-muted hover:text-fg transition-colors">{t(label)}</Link>}</li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-ink-700 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-8 text-xs text-fg-faint">
          <p className="shrink-0">&copy; {new Date().getFullYear()} Tarafab.XAi</p>
          <p className="max-w-xl sm:text-right leading-relaxed">{t('landing.footer.attr')}</p>
        </div>
      </footer>
    </div>
  )
}

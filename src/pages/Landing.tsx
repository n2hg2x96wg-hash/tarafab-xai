import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from '../components/layout/Logo';
import { Footer } from '../components/layout/Footer';
import { NavIcon } from '../components/layout/NavIcon';
import { Card } from '../components/ui/Card';
import { Reveal } from '../components/motion/Reveal';
import { useCountUp } from '../components/motion/useCountUp';
import { HeroCanvas } from '../components/landing/HeroCanvas';
import { DemoPortfolioWidget } from '../components/landing/DemoPortfolioWidget';
import { investmentPlans } from '../data/investments';

/* ---------------------------------- content ---------------------------------- */

const overviewPillars = [
  {
    icon: 'trending-up',
    title: 'Curated investment plans',
    description: 'Clear return ranges, durations, and minimums across every risk tier.',
  },
  {
    icon: 'pie-chart',
    title: 'Unified portfolio view',
    description: 'Stocks, crypto, bonds, real estate, and cash in one clean allocation.',
  },
  {
    icon: 'shield-check',
    title: 'Security-first design',
    description: 'Verification, two-factor authentication, and account isolation by default.',
  },
];

const analyticsHighlights = [
  'Five time ranges: 1W, 1M, 3M, 1Y, and All',
  'Profit & loss tracking per holding',
  'Best and worst performer insights',
  'Allocation drift visualization',
];

const securityHighlights = [
  {
    title: 'Identity verification',
    description: 'Simulated KYC flow keeps account status transparent from day one.',
  },
  {
    title: 'Two-factor authentication',
    description: 'A second layer of confirmation for sensitive account actions.',
  },
  {
    title: 'Full account isolation',
    description: 'Every session only ever exposes its own portfolio and history.',
  },
];

const supportOptions = [
  {
    icon: 'life-buoy',
    title: '24/7 help desk',
    description: 'Round-the-clock assistance for account and platform questions.',
  },
  {
    icon: 'list',
    title: 'Guides & FAQ',
    description: 'Step-by-step resources covering every feature of the platform.',
  },
  {
    icon: 'user',
    title: 'Direct contact',
    description: 'Reach the support team from inside your dashboard at any time.',
  },
];

const stats = [
  { target: 10000, suffix: '+', label: 'Simulated portfolios' },
  { target: 6, suffix: '', label: 'Curated investment plans' },
  { target: 5, suffix: '', label: 'Asset classes covered' },
  { target: 24, suffix: '/7', label: 'Support availability' },
];

/* --------------------------------- helpers ---------------------------------- */

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  align?: 'center' | 'left';
}) {
  return (
    <Reveal className={clsx('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
        {title}
      </h2>
      <p className="mt-4 text-base text-slate-600 dark:text-slate-300">{description}</p>
    </Reveal>
  );
}

function StatCounter({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const { ref, value } = useCountUp(target);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span ref={ref} className="text-3xl font-extrabold tracking-tight text-teal-500 sm:text-4xl">
        {value.toLocaleString('en-US')}
        {suffix}
      </span>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

function PrimaryCta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/login"
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/30 transition-all duration-300 hover:scale-[1.03] hover:bg-teal-400 hover:shadow-teal-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-950',
        className,
      )}
    >
      {children}
    </Link>
  );
}

function SecondaryCta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/login"
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-all duration-300 hover:border-teal-400 hover:bg-teal-50/60 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 dark:border-navy-500 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:bg-navy-800 dark:hover:text-teal-300 dark:focus-visible:ring-offset-navy-950',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------- page ------------------------------------ */

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-navy-950">
      {/* ------------------------------- header ------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-slate-50/80 backdrop-blur-md dark:border-navy-700/60 dark:bg-navy-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
            <Link
              to="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400"
            >
              Sign In
            </Link>
            <Link
              to="/login"
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 shadow-md shadow-teal-500/20 transition-all duration-300 hover:scale-105 hover:bg-teal-400"
            >
              Create Account
            </Link>
          </nav>
        </div>
      </header>

      {/* -------------------------------- hero -------------------------------- */}
      <section className="relative overflow-hidden" aria-labelledby="hero-heading">
        {/* animated gradient wash */}
        <div
          aria-hidden="true"
          className="animate-gradient-pan absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-gold-500/10 dark:from-teal-500/15 dark:via-navy-950 dark:to-gold-500/10"
        />
        {/* floating brand-colored blobs */}
        <div
          aria-hidden="true"
          className="animate-float-slow absolute -top-24 -left-24 h-72 w-72 rounded-full bg-teal-500/15 blur-3xl dark:bg-teal-500/20"
        />
        <div
          aria-hidden="true"
          className="animate-float absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl dark:bg-gold-500/15"
        />
        {/* particle constellation */}
        <HeroCanvas />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-600 dark:text-gold-400">
                <span className="animate-pulse-soft inline-block h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
                Next-Generation Investment Platform
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h1
                id="hero-heading"
                className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white"
              >
                Intelligent investing, <span className="text-teal-500">built for you</span>.
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
                Tarafab.XAi unifies portfolio management, curated investment plans, and AI-assisted
                analytics in one secure dashboard — so you can model strategies, track performance,
                and grow with confidence.
              </p>
            </Reveal>
            <Reveal delay={300} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <PrimaryCta className="w-full sm:w-auto">
                Create Account
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </PrimaryCta>
              <SecondaryCta className="w-full sm:w-auto">Sign In</SecondaryCta>
            </Reveal>
            <Reveal delay={400}>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Free to explore · No real funds required · Demo environment
              </p>
            </Reveal>
          </div>

          <Reveal variant="scale" delay={250} className="relative">
            <div
              aria-hidden="true"
              className="animate-spin-slow absolute -inset-8 rounded-full bg-[conic-gradient(from_90deg,transparent,rgba(20,184,166,0.12),transparent)]"
            />
            <DemoPortfolioWidget />
          </Reveal>
        </div>
      </section>

      {/* -------------------------------- stats -------------------------------- */}
      <section aria-label="Platform statistics" className="border-y border-slate-200/70 bg-white/70 py-10 backdrop-blur dark:border-navy-700/60 dark:bg-navy-900/60">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
          {stats.map((stat) => (
            <Reveal key={stat.label} variant="scale">
              <StatCounter {...stat} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* --------------------------- 1. platform overview --------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24" aria-labelledby="overview-heading">
        <SectionHeading
          eyebrow="Platform Overview"
          title={<span id="overview-heading">One platform for your entire investment journey</span>}
          description="From first deposit simulation to advanced performance review, Tarafab.XAi keeps every tool you need behind a single secure sign-in."
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {overviewPillars.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 120}>
              <Card hoverable className="group h-full">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500 transition-transform duration-300 group-hover:scale-110">
                  <NavIcon name={pillar.icon} />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{pillar.title}</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{pillar.description}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------- 2. portfolio management -------------------------- */}
      <section className="relative overflow-hidden border-y border-slate-200/70 bg-white/60 py-20 lg:py-24 dark:border-navy-700/60 dark:bg-navy-900/40" aria-labelledby="portfolio-heading">
        <div
          aria-hidden="true"
          className="animate-float absolute -left-32 top-10 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <Reveal variant="left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Portfolio Management
            </span>
            <h2 id="portfolio-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Every holding, allocation, and movement — at a glance
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Track total value, profit &amp; loss, and per-holding performance across five asset
              classes. The interactive preview mirrors the real dashboard experience.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {['Live-feel valuation updates on every chart', 'Asset allocation across equities, crypto, bonds, real estate, and cash', 'Per-holding performance with best/worst performer callouts'].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-500">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="right" delay={150}>
            <DemoPortfolioWidget />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------- 3. advanced analytics ---------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24" aria-labelledby="analytics-heading">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal variant="left" className="order-2 lg:order-1">
            <Card className="relative overflow-hidden">
              <div aria-hidden="true" className="animate-pulse-soft absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold-500/10 blur-2xl" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Insight feed</span>
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                  Simulated
                </span>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {[
                  { label: 'Quantum Growth Fund', delta: '+12.4%', up: true },
                  { label: 'Nova Crypto Basket', delta: '+8.1%', up: true },
                  { label: 'Horizon Real Estate Trust', delta: '+3.2%', up: true },
                  { label: 'Frontier Innovation Fund', delta: '-1.7%', up: false },
                ].map((row, index) => (
                  <li
                    key={row.label}
                    className={clsx(
                      'flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-navy-700',
                      index === 0 && 'animate-ticker',
                    )}
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{row.label}</span>
                    <span className={clsx('text-sm font-bold', row.up ? 'text-teal-500' : 'text-rose-500')}>
                      {row.delta}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-navy-800/70">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-gold-500">AI insight:</span> Your growth
                  allocation outperformed the balanced benchmark this quarter in the simulated model.
                </p>
              </div>
            </Card>
          </Reveal>
          <Reveal variant="right" className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Advanced Analytics
            </span>
            <h2 id="analytics-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Performance tracking that tells the whole story
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Interactive reports translate raw numbers into decisions. Switch time ranges, compare
              holdings, and spot trends before they pass you by.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analyticsHighlights.map((item) => (
                <li key={item} className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-teal-400/50 dark:border-navy-600/60 dark:text-slate-200">
                  <span className="text-teal-500">
                    <NavIcon name="bar-chart" className="h-4 w-4" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------- 4. security & trust ----------------------------- */}
      <section className="relative overflow-hidden border-y border-slate-200/70 bg-navy-900 py-20 lg:py-24 dark:border-navy-700/60 dark:bg-navy-900" aria-labelledby="security-heading">
        <div aria-hidden="true" className="animate-gradient-pan absolute inset-0 bg-gradient-to-tr from-teal-500/10 via-transparent to-gold-500/10" />
        <div className="relative mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-300">
              Security &amp; Trust
            </span>
            <h2 id="security-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Protection woven into every session
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Verification, layered authentication, and strict account isolation keep every
              portfolio private — exactly what you should expect from a modern financial platform.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {securityHighlights.map((item, index) => (
              <Reveal key={item.title} delay={index * 120} variant="scale">
                <div className="group h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-teal-400/40 hover:bg-white/10">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300 transition-transform duration-300 group-hover:scale-110">
                    <NavIcon name="shield-check" />
                  </span>
                  <h3 className="mt-4 font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- 5. investment tools ----------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24" aria-labelledby="tools-heading">
        <SectionHeading
          eyebrow="Investment Tools"
          title={<span id="tools-heading">Plans for every strategy and risk appetite</span>}
          description="Diversify across curated plans with transparent return ranges and minimums. All figures are simulated market data for demonstration."
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {investmentPlans.slice(0, 3).map((plan, index) => (
            <Reveal key={plan.id} delay={index * 120}>
              <Card hoverable className="group flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                    {plan.category}
                  </span>
                  <span
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      plan.risk === 'Low' && 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
                      plan.risk === 'Medium' && 'bg-gold-500/10 text-gold-600 dark:text-gold-400',
                      plan.risk === 'High' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                    )}
                  >
                    {plan.risk} risk
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="mt-2 flex-1 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm dark:border-navy-700">
                  <span className="font-bold text-teal-600 dark:text-teal-400">{plan.returnRange}</span>
                  <span className="text-xs text-slate-400">Min ${plan.minInvestment.toLocaleString('en-US')}</span>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 text-center">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-400">
            Return ranges are simulated and not guaranteed
          </p>
          <SecondaryCta>Explore all plans after sign-in</SecondaryCta>
        </Reveal>
      </section>

      {/* ----------------------------- 6. customer support ----------------------------- */}
      <section className="border-t border-slate-200/70 bg-white/60 py-20 lg:py-24 dark:border-navy-700/60 dark:bg-navy-900/40" aria-labelledby="support-heading">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Customer Support"
            title={<span id="support-heading">Help that never sleeps</span>}
            description="Questions about your account, a plan, or a chart? Our support resources and team are available around the clock."
          />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {supportOptions.map((option, index) => (
              <Reveal key={option.title} delay={index * 120}>
                <Card hoverable className="group h-full">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500 transition-transform duration-300 group-hover:scale-110">
                    <NavIcon name={option.icon} />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{option.title}</h3>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{option.description}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------- final CTA -------------------------------- */}
      <section className="relative overflow-hidden px-6 py-20 lg:py-24" aria-labelledby="cta-heading">
        <div aria-hidden="true" className="animate-gradient-pan absolute inset-0 bg-gradient-to-r from-teal-500/15 via-transparent to-gold-500/15" />
        <div aria-hidden="true" className="animate-float absolute right-10 top-10 h-40 w-40 rounded-full bg-teal-500/15 blur-3xl" />
        <Reveal variant="scale" className="relative mx-auto max-w-3xl text-center">
          <h2 id="cta-heading" className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Ready to take control of your portfolio?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 dark:text-slate-300">
            Create your account in seconds and explore the full Tarafab.XAi dashboard — portfolio,
            analytics, plans, and more.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta>
              Create Account
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </PrimaryCta>
            <SecondaryCta>Sign In</SecondaryCta>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { HeroLivePanel, LatestBlocks, LiveTickerBar, useLiveMarket } from '@/components/LiveCrypto'
import { IconCheck, Logo } from '@/components/Icons'
import { FaqSection, HistorySection, NetworkSection, Reveal } from '@/components/LandingExtras'

function TradingViewWidget() {
  const ref = useRef<HTMLDivElement>(null)
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
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(15, 18, 22, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
    })
    el.appendChild(script)
    return () => { el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' }
  }, [])
  return (
    <div className="tradingview-widget-container h-[420px] sm:h-[480px]" ref={ref}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

const steps = [
  {
    title: 'Create an account',
    body: 'Sign up with your name, email and a password. Your dashboard shows your balances and history from the first login.',
  },
  {
    title: 'Send Bitcoin',
    body: 'Your dashboard shows the Bitcoin deposit address and a QR code. Send BTC from any wallet or exchange.',
  },
  {
    title: 'Upload your receipt',
    body: 'Submit the amount and a screenshot or PDF of the transfer (JPG, PNG, WEBP or PDF, up to 5 MB).',
  },
  {
    title: 'We review and credit it',
    body: 'The deposit shows as pending until our team checks it. Your balance changes only after it is approved.',
  },
]

const safeguards = [
  'You can only see your own balances and transactions. This is enforced by the database, not just the app.',
  'Balances cannot be changed from a client account. They change only when a deposit or withdrawal is approved.',
  'Every deposit approval and rejection is written to an audit log, with the reviewer and any reason they gave.',
  'Passwords are handled by Supabase Auth and are never stored in plain text.',
  'The whole site is served over HTTPS.',
]

export default function LandingPage() {
  const router = useRouter()
  const market = useLiveMarket()

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
      <section className="border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <h1 className="text-[40px] sm:text-5xl lg:text-[56px] leading-[1.05] font-semibold tracking-tight text-fg">
              Deposit Bitcoin.<br />Track every dollar.
            </h1>
            <p className="mt-6 text-lg text-fg-muted leading-relaxed max-w-xl">
              Send BTC to your deposit address, upload the transfer receipt, and follow it from pending to approved. Your balance and full transaction history are in one dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/sign-up" className="btn btn-solid">Open an account</Link>
              <Link href="/sign-in" className="btn btn-outline">Sign in</Link>
            </div>
            <p className="mt-6 text-[13px] text-fg-faint max-w-md">
              Bitcoin prices move quickly and can fall. We do not promise returns.
            </p>
          </div>

          <HeroLivePanel {...market} />
        </div>
      </section>

      {/* Markets */}
      <section id="markets" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <Reveal><div className="mb-8 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">Markets</h2>
            <p className="mt-3 text-fg-muted">The same live data you will see in your dashboard. Nothing on this page is simulated.</p>
          </div></Reveal>

          <Reveal><div className="panel overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
              <span className="text-fg">BTC/USD</span>
              <span className="text-fg-faint">Chart by TradingView</span>
            </div>
            <TradingViewWidget />
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
            <h2 className="text-3xl font-semibold tracking-tight text-fg">How deposits work</h2>
            <p className="mt-3 text-fg-muted">A deposit is never credited automatically. Each one is checked by a person first.</p>
          </div></Reveal>
          <Reveal><ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-ink-950 p-6">
                <div className="text-[13px] text-accent font-medium tabular-nums mb-3">Step {i + 1}</div>
                <h3 className="text-[17px] font-semibold text-fg mb-2">{s.title}</h3>
                <p className="text-[15px] text-fg-muted leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol></Reveal>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-16 border-b border-ink-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-[1fr_1.4fr] gap-10">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-fg">How your account is protected</h2>
            <p className="mt-3 text-fg-muted">What the platform does today, stated plainly.</p>
          </Reveal>
          <Reveal delay={100}><ul className="divide-y divide-ink-700 border-y border-ink-700">
            {safeguards.map(item => (
              <li key={item} className="flex gap-3 py-4">
                <IconCheck className="shrink-0 mt-0.5 text-accent" />
                <span className="text-[15px] text-fg-muted leading-relaxed">{item}</span>
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
            <h2 className="text-2xl font-semibold tracking-tight text-fg">Open an account</h2>
            <p className="mt-2 text-fg-muted">All you need is an email address and a password.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/sign-up" className="btn btn-solid">Open an account</Link>
            <Link href="/sign-in" className="btn btn-outline">Sign in</Link>
          </div>
        </div></Reveal>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <Logo />
            <p className="mt-3 text-[13px] text-fg-faint max-w-sm">
              Market data from Coinbase, CoinGecko, mempool.space and TradingView. Investing in Bitcoin carries risk, including loss of the money you deposit.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <a href="#markets" className="text-fg-muted hover:text-fg">Markets</a>
            <Link href="/sign-in" className="text-fg-muted hover:text-fg">Sign in</Link>
            <a href="#how-it-works" className="text-fg-muted hover:text-fg">How it works</a>
            <Link href="/sign-up" className="text-fg-muted hover:text-fg">Open an account</Link>
            <a href="#security" className="text-fg-muted hover:text-fg">Security</a>
            <Link href="/forgot-password" className="text-fg-muted hover:text-fg">Reset password</Link>
          </nav>
        </div>
        <p className="mt-10 pt-6 border-t border-ink-700 text-xs text-fg-faint">&copy; {new Date().getFullYear()} Tarafab.XAi</p>
      </footer>
    </div>
  )
}

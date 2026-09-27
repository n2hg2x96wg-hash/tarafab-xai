'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { BitcoinMarketCard, BitcoinNetworkCard } from '@/components/BitcoinMarket'

function useReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal')
    elements.forEach(el => el.classList.add('reveal-init'))
    requestAnimationFrame(() => {
      const observer = new IntersectionObserver(
        (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
      )
      elements.forEach(el => observer.observe(el))
    })
    return () => {}
  }, [])
}

function Counter({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        let start = 0
        const step = target / (1500 / 16)
        const timer = setInterval(() => {
          start += step
          if (start >= target) { setCount(target); clearInterval(timer) }
          else setCount(Math.floor(start))
        }, 16)
      }
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>
}

function TradingViewWidget() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'BINANCE:BTCUSDT',
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(8, 8, 16, 0)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
    })
    ref.current.appendChild(script)
    return () => { if (ref.current) ref.current.innerHTML = '' }
  }, [])
  return (
    <div className="tradingview-widget-container" ref={ref} style={{ height: '500px', width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
    </div>
  )
}

export default function LandingPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  useReveal()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single() as { data: { role?: string } | null }
          if (profile?.role === 'admin') { router.push('/admin'); return }
          router.push('/dashboard'); return
        }
      } catch { /* continue */ }
      setLoading(false)
    }
    checkAuth()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080810] overflow-x-hidden">
      <Navbar />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-16 px-4">
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-violet-600/[0.08] rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-blue-600/[0.06] rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-violet-500/[0.05] rounded-full blur-2xl animate-float" />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Institutional-grade platform — live
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-4 animate-slide-up">
            <span className="text-white">TARAFAB</span><span className="text-violet-400">.XAi</span>
          </h1>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 animate-slide-up">
            Invest with <span className="gradient-text">Clarity.</span>
          </h2>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-time settlement, transparent reporting, and institutional-grade custody. Built for serious investors who demand more.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/sign-up" className="w-full sm:w-auto px-10 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all duration-200 shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)] hover:-translate-y-0.5">
              Open Account
            </Link>
            <Link href="/sign-in" className="w-full sm:w-auto px-10 py-4 text-base font-medium text-slate-300 hover:text-white border border-white/[0.12] hover:border-violet-500/40 rounded-xl transition-all duration-200 hover:bg-violet-500/[0.06]">
              Sign In →
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-10 pt-8 border-t border-white/[0.06]">
            {[
              { value: 99, suffix: '.9%', label: 'Platform uptime' },
              { value: 256, suffix: '-bit', label: 'Encryption standard' },
              { value: 24, suffix: '/7', label: 'Account access' },
            ].map(({ value, suffix, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold text-white"><Counter target={value} suffix={suffix} /></div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE CHART ── */}
      <section id="markets" className="py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="reveal text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              Live BTC/USD chart
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Bitcoin Market</h2>
            <p className="text-slate-400 text-sm">Real-time price action from Binance via TradingView</p>
          </div>
          <div className="reveal glass rounded-2xl overflow-hidden border border-white/[0.06] mb-6" style={{ minHeight: '520px' }}>
            <TradingViewWidget />
          </div>
          <div className="reveal grid lg:grid-cols-2 gap-6">
            <BitcoinMarketCard />
            <BitcoinNetworkCard />
          </div>
        </div>
      </section>

      {/* ── PLATFORM FEATURES ── */}
      <section id="platform" className="py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="reveal text-center mb-14">
            <h2 className="text-4xl font-bold text-white mb-4">Built for serious investors</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Every feature designed around transparency, security, and real performance.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '🔐', title: 'Secure Authentication', desc: 'Multi-layer authentication and encrypted session management protect every account.', color: 'from-violet-500/20 to-transparent' },
              { icon: '⚡', title: 'Real-time Settlement', desc: 'Transactions complete with full transparency and real-time network confirmation.', color: 'from-blue-500/20 to-transparent' },
              { icon: '₿', title: 'Bitcoin Native', desc: 'Dedicated Bitcoin deposit, tracking, and portfolio management built in.', color: 'from-orange-500/20 to-transparent' },
              { icon: '📊', title: 'Live Market Data', desc: 'Real BTC/USD pricing, candlestick charts, and network stats from verified sources.', color: 'from-emerald-500/20 to-transparent' },
              { icon: '📋', title: 'Transparent Reporting', desc: 'Every transaction is logged, audited, and visible in your dashboard history.', color: 'from-pink-500/20 to-transparent' },
              { icon: '🔒', title: 'Data Encryption', desc: 'All data encrypted at rest and in transit using industry-standard protocols.', color: 'from-cyan-500/20 to-transparent' },
            ].map(({ icon, title, desc, color }) => (
              <div key={title} className="reveal glass glass-hover rounded-2xl p-6 group">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} border border-white/[0.08] flex items-center justify-center text-xl mb-5 group-hover:scale-110 transition-transform duration-200`}>
                  {icon}
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-transparent via-violet-950/10 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="reveal text-center mb-14">
            <h2 className="text-4xl font-bold text-white mb-4">How it works</h2>
            <p className="text-slate-400">Get started in minutes</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Create Account', desc: 'Sign up with your email and verify your identity to activate your account.' },
              { step: '02', title: 'Deposit Bitcoin', desc: 'Send BTC to your assigned deposit address. Funds appear after network confirmation.' },
              { step: '03', title: 'Track & Manage', desc: 'Monitor your portfolio, view live markets, and manage your Bitcoin position.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="reveal glass rounded-2xl p-6 text-center relative overflow-hidden group hover:-translate-y-1 transition-transform">
                <div className="text-6xl font-black text-violet-500/10 absolute top-3 right-4 select-none">{step}</div>
                <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-300 mx-auto mb-4 relative z-10">{step}</div>
                <h3 className="font-semibold text-white mb-2 relative z-10">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed relative z-10">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section id="security" className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="reveal glass rounded-3xl p-8 sm:p-12 border border-violet-500/10 shadow-[0_0_80px_rgba(124,58,237,0.1)]">
            <div className="text-center mb-10">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-500/30 border border-violet-500/20 flex items-center justify-center text-2xl">🛡️</div>
              <h2 className="text-3xl font-bold text-white mb-3">Security & Trust</h2>
              <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">We are transparent about what our platform provides. No inflated promises — only real capabilities.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                '✓ Secure authentication via Supabase',
                '✓ Transparent transaction records',
                '✓ Real-time market data from verified sources',
                '✓ Account activity monitoring',
                '✓ Data encryption in transit and at rest',
                '✗ No guaranteed returns or risk-free claims',
              ].map((item) => (
                <div key={item} className={`flex items-start gap-3 p-3.5 rounded-xl ${item.startsWith('✗') ? 'bg-red-500/[0.06] border border-red-500/10' : 'bg-white/[0.03] border border-white/[0.05]'}`}>
                  <span className={`text-sm flex-shrink-0 font-bold ${item.startsWith('✗') ? 'text-red-400' : 'text-emerald-400'}`}>{item[0]}</span>
                  <span className="text-slate-300 text-sm">{item.slice(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 sm:px-6 text-center">
        <div className="max-w-3xl mx-auto reveal">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">Ready to get started?</h2>
          <p className="text-slate-400 text-lg mb-10">Open your account in minutes and invest with full clarity.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up" className="px-10 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:-translate-y-0.5">
              Open Account
            </Link>
            <Link href="/sign-in" className="px-10 py-4 text-base font-medium text-slate-300 hover:text-white border border-white/[0.12] hover:border-violet-500/40 rounded-xl transition-all">
              Already have an account?
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06] py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">₿</div>
                <span className="font-bold text-white">Tarafab<span className="text-violet-400">.XAi</span></span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">Transparent investment management with real-time settlement.</p>
            </div>
            {[
              { heading: 'Platform', links: [{ label: 'Markets', href: '#markets' }, { label: 'Bitcoin', href: '#bitcoin' }, { label: 'Security', href: '#security' }] },
              { heading: 'Account', links: [{ label: 'Sign In', href: '/sign-in' }, { label: 'Open Account', href: '/sign-up' }, { label: 'Dashboard', href: '/dashboard' }] },
              { heading: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'Risk Disclosure', href: '#' }] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold text-white mb-3">{heading}</h4>
                <ul className="space-y-2">
                  {links.map(({ label, href }) => (
                    <li key={label}><Link href={href} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-600 text-xs">© 2026 Tarafab.XAi. All rights reserved.</p>
            <p className="text-slate-700 text-xs">Investment involves risk. Past performance is not indicative of future results.</p>
          </div>
        </div>
        <Link href="/staff-login" className="text-[#080810] text-xs select-none">·</Link>
      </footer>
    </div>
  )
}

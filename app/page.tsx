'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { BitcoinMarketCard, BitcoinNetworkCard } from '@/components/BitcoinMarket'

// Scroll reveal hook
function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

// Animated counter
function Counter({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        let start = 0
        const duration = 1500
        const step = target / (duration / 16)
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

export default function LandingPage() {
  const [user, setUser] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  useReveal()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()
          if (profile?.role === 'admin') router.push('/admin')
          else { setUser(session.user); router.push('/dashboard') }
        }
      } catch { /* continue */ }
      setLoading(false)
    }
    checkAuth()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080810]">
      <Navbar />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Background elements */}
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-violet-600/[0.06] rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-blue-600/[0.05] rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-violet-500/[0.04] rounded-full blur-2xl animate-float" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Institutional-grade platform — live
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tight mb-4">
            <span className="text-white">TARAFAB</span>
            <span className="text-violet-400">.XAi</span>
          </h1>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Invest with{' '}
            <span className="gradient-text">Clarity.</span>
          </h2>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-time settlement, transparent reporting, and institutional-grade custody.
            Built for serious investors.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all duration-200 shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)] hover:-translate-y-0.5 active:translate-y-0 relative overflow-hidden group"
            >
              <span className="relative z-10">Open Account</span>
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
            </Link>
            <Link
              href="/sign-in"
              className="w-full sm:w-auto px-8 py-4 text-base font-medium text-slate-300 hover:text-white border border-white/[0.12] hover:border-violet-500/40 rounded-xl transition-all duration-200 hover:bg-violet-500/[0.06]"
            >
              Sign In →
            </Link>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mt-16 pt-8 border-t border-white/[0.06]">
            {[
              { value: 99, suffix: '.9% Uptime', label: 'Platform reliability' },
              { value: 256, prefix: '', suffix: '-bit Encryption', label: 'Data security' },
              { value: 24, suffix: '/7 Support', label: 'Always available' },
            ].map(({ value, prefix, suffix, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-white">
                  <Counter target={value} prefix={prefix} suffix={suffix} />
                </div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BITCOIN MARKET ── */}
      <section id="bitcoin" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="reveal text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Live market data
          </div>
          <h2 className="text-4xl font-bold text-white mb-3">Bitcoin Market</h2>
          <p className="text-slate-400">Real-time BTC/USD data and network statistics</p>
        </div>
        <div className="reveal grid lg:grid-cols-2 gap-6">
          <BitcoinMarketCard />
          <BitcoinNetworkCard />
        </div>
      </section>

      {/* ── PLATFORM FEATURES ── */}
      <section id="platform" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="reveal text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Built for serious investors</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Every feature is designed around transparency, security, and performance.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: '🔐',
              title: 'Secure Authentication',
              desc: 'Multi-factor authentication and encrypted session management protect every account.',
              color: 'from-violet-500/20 to-violet-500/5',
            },
            {
              icon: '⚡',
              title: 'Real-time Settlement',
              desc: 'Transactions complete with full transparency and real-time confirmation.',
              color: 'from-blue-500/20 to-blue-500/5',
            },
            {
              icon: '📊',
              title: 'Transparent Reporting',
              desc: 'Every transaction is audited, logged, and available in your dashboard.',
              color: 'from-emerald-500/20 to-emerald-500/5',
            },
            {
              icon: '🌐',
              title: 'Real-time Market Data',
              desc: 'Live Bitcoin pricing and network statistics from verified public sources.',
              color: 'from-orange-500/20 to-orange-500/5',
            },
            {
              icon: '📱',
              title: 'Account Monitoring',
              desc: 'Activity monitoring and notifications keep you informed of every action.',
              color: 'from-pink-500/20 to-pink-500/5',
            },
            {
              icon: '🔒',
              title: 'Data Encryption',
              desc: 'All data is encrypted at rest and in transit using industry standards.',
              color: 'from-cyan-500/20 to-cyan-500/5',
            },
          ].map(({ icon, title, desc, color }) => (
            <div key={title} className="reveal glass glass-hover rounded-2xl p-6 group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} border border-white/[0.08] flex items-center justify-center text-xl mb-5 group-hover:scale-110 transition-transform`}>
                {icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section id="security" className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="reveal glass rounded-3xl p-8 sm:p-12 text-center border border-violet-500/10 glow-violet">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-500/30 border border-violet-500/20 flex items-center justify-center text-3xl">
              🛡️
            </div>
            <h2 className="text-3xl font-bold text-white mb-4" id="security">Security & Trust</h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
              We are transparent about what our platform provides. Security is built into every layer.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-left">
              {[
                'Secure authentication via Supabase',
                'Transparent transaction records',
                'Real-time market data from verified sources',
                'Account activity monitoring',
                'Data encryption in transit and at rest',
                'No guaranteed returns or risk-free claims',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-slate-300 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center reveal">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Ready to get started?
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Open your account in minutes and start investing with clarity.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="px-10 py-4 text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all duration-200 shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:-translate-y-0.5"
            >
              Open Account
            </Link>
            <Link
              href="/sign-in"
              className="px-10 py-4 text-base font-medium text-slate-300 hover:text-white border border-white/[0.12] hover:border-violet-500/40 rounded-xl transition-all"
            >
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
              <p className="text-slate-500 text-xs leading-relaxed">
                Transparent investment management with real-time settlement.
              </p>
            </div>
            {[
              {
                heading: 'Platform',
                links: [
                  { label: 'Markets', href: '#markets' },
                  { label: 'Bitcoin', href: '#bitcoin' },
                  { label: 'Security', href: '#security' },
                  { label: 'Help', href: '#' },
                ],
              },
              {
                heading: 'Account',
                links: [
                  { label: 'Sign In', href: '/sign-in' },
                  { label: 'Open Account', href: '/sign-up' },
                  { label: 'Dashboard', href: '/dashboard' },
                ],
              },
              {
                heading: 'Legal',
                links: [
                  { label: 'Privacy', href: '#' },
                  { label: 'Terms', href: '#' },
                  { label: 'Risk Disclosure', href: '#' },
                ],
              },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold text-white mb-3">{heading}</h4>
                <ul className="space-y-2">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <Link href={href} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-xs">&copy; 2026 Tarafab.XAi. All rights reserved.</p>
            <p className="text-slate-700 text-xs">Investment involves risk. Past performance is not indicative of future results.</p>
          </div>
        </div>
        {/* Hidden staff access */}
        <Link href="/staff-login" className="text-[#080810] hover:text-[#0d0d1a] text-xs">·</Link>
      </footer>
    </div>
  )
}

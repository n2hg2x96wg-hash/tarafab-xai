'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'

interface Profile { full_name: string | null; email: string | null; role: string | null }

function TradingViewChart() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'BINANCE:BTCUSDT',
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(8, 8, 16, 0)',
      gridColor: 'rgba(255, 255, 255, 0.03)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
    })
    ref.current.appendChild(script)
    return () => { if (ref.current) ref.current.innerHTML = '' }
  }, [])
  return (
    <div className="tradingview-widget-container" ref={ref} style={{ height: '100%', width: '100%', minHeight: '420px' }}>
      <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
    </div>
  )
}

const navItems = [
  { icon: '⊞', label: 'Overview', id: 'overview' },
  { icon: '₿', label: 'Bitcoin', id: 'bitcoin' },
  { icon: '📈', label: 'Live Markets', id: 'markets' },
  { icon: '📋', label: 'Account Statement', id: 'statement' },
  { icon: '🔒', label: 'Security', id: 'security' },
]

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeNav, setActiveNav] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/sign-in'); return }
        const { data: p } = await supabase.from('profiles').select('full_name,email,role').eq('id', session.user.id).single()
        setProfile(p ?? { full_name: session.user.user_metadata?.full_name ?? null, email: session.user.email ?? null, role: 'client' })
      } catch { router.push('/sign-in'); return }
      setLoading(false)
    }
    init()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
      </div>
    )
  }

  const displayName = profile?.full_name ?? profile?.email?.split('@')[0] ?? 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen bg-[#080810] flex overflow-hidden">

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 flex-shrink-0 bg-[#0a0a14] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold shadow-[0_0_20px_rgba(124,58,237,0.4)]">₿</div>
            <span className="font-bold text-white">Tarafab<span className="text-violet-400">.XAi</span></span>
          </Link>
        </div>

        {/* User */}
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04]">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold flex-shrink-0">{initials}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE — Markets Open
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ icon, label, id }) => (
            <button
              key={id}
              onClick={() => { setActiveNav(id); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left ${
                activeNav === id
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
              {id === 'markets' && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">Live</span>}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] transition-all"
          >
            <span className="text-base">→</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-white/[0.06] bg-[#080810]/90 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06]">
              <div className="space-y-1"><div className="w-5 h-0.5 bg-current" /><div className="w-5 h-0.5 bg-current" /><div className="w-5 h-0.5 bg-current" /></div>
            </button>
            <div>
              <h1 className="text-sm font-semibold text-white capitalize">{navItems.find(n => n.id === activeNav)?.label ?? 'Dashboard'}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">Welcome back, {displayName.split(' ')[0]}</p>
            </div>
          </div>

          {/* Top bar stats */}
          <div className="hidden md:flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>BTC</span>
              <span className="text-white font-mono font-semibold" id="btc-price-top">—</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <span className="text-slate-500">Balance: </span>
              <span className="text-white font-semibold">$0.00</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-all relative">
              🔔
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-500" />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">{initials}</div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* Overview / Bitcoin tabs */}
          {(activeNav === 'overview' || activeNav === 'bitcoin') && (
            <div className="space-y-6">
              {/* Account info banner */}
              <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-3">
                <span className="text-violet-400 text-lg flex-shrink-0 mt-0.5">ℹ</span>
                <div>
                  <p className="text-violet-300 text-sm font-medium">Account Active</p>
                  <p className="text-slate-400 text-xs mt-0.5">Your Tarafab.XAi account is set up. Deposit Bitcoin to begin.</p>
                </div>
              </div>

              {/* Portfolio cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: 'Bitcoin Balance', value: '0.00000000 BTC', sub: '$0.00 USD', icon: '₿', gradient: 'from-orange-500/20 to-orange-500/5' },
                  { label: 'Available Balance', value: '$0.00', sub: 'Ready to invest', icon: '💵', gradient: 'from-emerald-500/20 to-emerald-500/5' },
                  { label: 'Pending', value: '$0.00', sub: 'Awaiting confirmation', icon: '⏳', gradient: 'from-yellow-500/20 to-yellow-500/5' },
                  { label: 'Account Status', value: 'Active', sub: 'Verified', icon: '✓', gradient: 'from-violet-500/20 to-violet-500/5' },
                ].map(({ label, value, sub, icon, gradient }) => (
                  <div key={label} className="glass rounded-2xl p-4 sm:p-5 border border-white/[0.06] hover:border-violet-500/20 transition-all group">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} border border-white/[0.06] flex items-center justify-center text-base mb-3 group-hover:scale-110 transition-transform`}>{icon}</div>
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="text-sm font-bold text-white leading-tight">{value}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Live chart + order panel */}
              <div className="grid xl:grid-cols-3 gap-6">
                {/* Chart */}
                <div className="xl:col-span-2 glass rounded-2xl border border-white/[0.06] overflow-hidden" style={{ minHeight: '460px' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xs font-bold">₿</div>
                      <div>
                        <p className="text-sm font-semibold text-white">Bitcoin / USDT</p>
                        <p className="text-xs text-slate-500">BTC/USDT · Binance</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE
                    </div>
                  </div>
                  <TradingViewChart />
                </div>

                {/* Order / Deposit panel */}
                <div className="glass rounded-2xl border border-white/[0.06] p-5 flex flex-col gap-4">
                  <h3 className="font-semibold text-white text-sm">Bitcoin Actions</h3>

                  {/* Action tabs */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.04] rounded-xl">
                    {['Deposit', 'Withdraw'].map((tab, i) => (
                      <button key={tab} className={`py-2 rounded-lg text-xs font-semibold transition-all ${i === 0 ? 'bg-violet-600 text-white shadow-[0_0_15px_rgba(124,58,237,0.3)]' : 'text-slate-500 cursor-not-allowed opacity-50'}`} disabled={i !== 0}>
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-slate-500 mb-3">Send Bitcoin to your deposit address:</p>

                    {/* QR placeholder */}
                    <div className="w-full aspect-square max-w-[140px] mx-auto rounded-xl border-2 border-dashed border-white/[0.1] bg-white/[0.02] flex flex-col items-center justify-center gap-2 mb-4">
                      <svg width="48" height="48" viewBox="0 0 48 48" className="text-slate-600" fill="currentColor">
                        <rect x="2" y="2" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                        <rect x="6" y="6" width="10" height="10" rx="1"/>
                        <rect x="28" y="2" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                        <rect x="32" y="6" width="10" height="10" rx="1"/>
                        <rect x="2" y="28" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                        <rect x="6" y="32" width="10" height="10" rx="1"/>
                        <rect x="28" y="28" width="4" height="4"/><rect x="36" y="28" width="4" height="4"/>
                        <rect x="28" y="36" width="4" height="4"/><rect x="36" y="36" width="4" height="4"/>
                      </svg>
                      <span className="text-[10px] text-slate-600">QR Code</span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-3">
                      <p className="text-[10px] text-slate-500 mb-1.5">Deposit address</p>
                      <div className="h-4 skeleton rounded w-full mb-2" />
                      <p className="text-[10px] text-slate-600">Assigned after account setup</p>
                    </div>

                    <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-[10px] text-yellow-400 font-medium">⚠ Only send BTC to this address. Other assets will be lost.</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <p className="text-slate-500 font-medium">Deposit flow:</p>
                    {['Send BTC to address above', 'Network confirms (~10 min)', 'Balance updates automatically'].map((s, i) => (
                      <div key={s} className="flex items-center gap-2 text-slate-400">
                        <span className="w-4 h-4 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[9px] text-violet-400 font-bold flex-shrink-0">{i + 1}</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="glass rounded-2xl border border-white/[0.06]">
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                  <h3 className="font-semibold text-white text-sm">Recent Activity</h3>
                  <button className="text-xs text-violet-400 hover:text-violet-300 transition-colors">View all →</button>
                </div>
                <div className="p-12 text-center">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">📋</div>
                  <p className="text-slate-400 text-sm">No transactions yet</p>
                  <p className="text-slate-600 text-xs mt-1">Your transaction history will appear here</p>
                </div>
              </div>
            </div>
          )}

          {/* Markets tab */}
          {activeNav === 'markets' && (
            <div className="space-y-6">
              <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden" style={{ minHeight: '600px' }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold text-white">Live Markets</span>
                  <span className="text-xs text-slate-500">BTC/USDT · Real-time</span>
                </div>
                <TradingViewChart />
              </div>
              <BitcoinMarketCard />
            </div>
          )}

          {/* Statement tab */}
          {activeNav === 'statement' && (
            <div className="glass rounded-2xl border border-white/[0.06] p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-2xl">📋</div>
              <h3 className="text-white font-semibold mb-2">Account Statement</h3>
              <p className="text-slate-400 text-sm">No transactions yet. Your full account history will appear here once you start using your account.</p>
            </div>
          )}

          {/* Security tab */}
          {activeNav === 'security' && (
            <div className="space-y-4">
              <div className="glass rounded-2xl border border-white/[0.06] p-6">
                <h3 className="font-semibold text-white mb-5">Security Status</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Email Verified', status: 'Active', icon: '✉', color: 'text-emerald-400' },
                    { label: 'Password', status: 'Set', icon: '🔑', color: 'text-emerald-400' },
                    { label: '2FA', status: 'Coming soon', icon: '🛡', color: 'text-slate-500' },
                  ].map(({ label, status, icon, color }) => (
                    <div key={label} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className={`text-xl ${color}`}>{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className={`text-xs ${color}`}>{status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass rounded-2xl border border-white/[0.06] p-6">
                <h3 className="font-semibold text-white mb-3 text-sm">Account Information</h3>
                <div className="space-y-3">
                  {[['Full name', profile?.full_name ?? '—'], ['Email', profile?.email ?? '—'], ['Account type', 'Client']].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                      <span className="text-slate-500 text-sm">{label}</span>
                      <span className="text-white text-sm font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

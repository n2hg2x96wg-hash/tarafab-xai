'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard, BitcoinNetworkCard } from '@/components/BitcoinMarket'

interface Profile {
  full_name: string | null
  email: string | null
  role: string | null
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/sign-in'); return }
      const { data: p } = await supabase.from('profiles').select('full_name,email,role').eq('id', session.user.id).single()
      setProfile(p ?? { full_name: session.user.email ?? null, email: session.user.email ?? null, role: 'client' })
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

  const displayName = profile?.full_name ?? profile?.email ?? 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen bg-[#080810]">
      {/* Background */}
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/[0.04] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-[#080810]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">₿</div>
            <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {['Portfolio', 'Bitcoin', 'History', 'Security'].map(item => (
              <button key={item} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all">
                {item}
              </button>
            ))}
          </nav>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.06] transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                {initials}
              </div>
              <span className="hidden sm:block text-sm text-slate-300 max-w-[120px] truncate">{displayName}</span>
              <svg className={`w-4 h-4 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl border border-white/[0.08] shadow-2xl py-1 z-50">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-xs font-medium text-white truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
                </div>
                <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all">Profile</button>
                <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all">Settings</button>
                <div className="border-t border-white/[0.06] mt-1 pt-1">
                  <button onClick={handleSignOut} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] transition-all">
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Good day, {displayName.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">Here&apos;s your portfolio overview</p>
        </div>

        {/* Account Status Banner */}
        <div className="mb-6 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-3">
          <span className="text-violet-400 text-lg flex-shrink-0">ℹ</span>
          <div>
            <p className="text-violet-300 text-sm font-medium">Account Active</p>
            <p className="text-slate-400 text-xs mt-0.5">Your account is set up and ready. Bitcoin deposits and withdrawals are available.</p>
          </div>
        </div>

        {/* Portfolio Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Bitcoin Balance', value: '0.00000000 BTC', sub: '$0.00', icon: '₿', color: 'from-orange-500/20 to-orange-500/5' },
            { label: 'Available Balance', value: '$0.00', sub: 'USD equivalent', icon: '💵', color: 'from-emerald-500/20 to-emerald-500/5' },
            { label: 'Pending Balance', value: '$0.00', sub: 'Awaiting confirmation', icon: '⏳', color: 'from-yellow-500/20 to-yellow-500/5' },
            { label: 'Account Status', value: 'Active', sub: 'Verified', icon: '✓', color: 'from-violet-500/20 to-violet-500/5' },
          ].map(({ label, value, sub, icon, color }) => (
            <div key={label} className="glass rounded-2xl p-5 border border-white/[0.06] hover:border-violet-500/20 transition-all">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} border border-white/[0.06] flex items-center justify-center text-base mb-3`}>
                {icon}
              </div>
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-sm font-bold text-white leading-tight">{value}</p>
              <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Bitcoin Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Bitcoin</h2>
            <div className="flex gap-2">
              <button className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-lg hover:opacity-90 transition-all shadow-[0_0_15px_rgba(124,58,237,0.25)]">
                Deposit Bitcoin
              </button>
              <button className="px-4 py-2 text-xs font-medium text-slate-400 border border-white/[0.1] rounded-lg hover:border-violet-500/30 hover:text-slate-300 transition-all cursor-not-allowed opacity-60" title="Coming soon">
                Withdraw
              </button>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <BitcoinMarketCard />
            <BitcoinNetworkCard />
          </div>
        </div>

        {/* Bitcoin Deposit Info */}
        <div className="mb-8 glass rounded-2xl p-6 border border-white/[0.06]">
          <h3 className="font-semibold text-white mb-4">Deposit Bitcoin</h3>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                To deposit Bitcoin, send funds to your assigned deposit address. The system will detect your transaction on the Bitcoin network.
              </p>
              <div className="space-y-3">
                {[
                  { step: '1', text: 'Copy your deposit address below' },
                  { step: '2', text: 'Send BTC from your wallet' },
                  { step: '3', text: 'Wait for network confirmation (~10 min)' },
                  { step: '4', text: 'Balance updates after confirmation' },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs text-violet-400 font-bold flex-shrink-0 mt-0.5">{step}</div>
                    <p className="text-sm text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-4">
              {/* QR placeholder */}
              <div className="w-36 h-36 rounded-xl border-2 border-dashed border-white/[0.1] bg-white/[0.02] flex flex-col items-center justify-center gap-2">
                <svg width="40" height="40" viewBox="0 0 40 40" className="text-slate-600" fill="currentColor">
                  <rect x="2" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <rect x="5" y="5" width="10" height="10" rx="1"/>
                  <rect x="22" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <rect x="25" y="5" width="10" height="10" rx="1"/>
                  <rect x="2" y="22" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <rect x="5" y="25" width="10" height="10" rx="1"/>
                </svg>
                <span className="text-xs text-slate-600">Address QR</span>
              </div>
              <div className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <p className="text-xs text-slate-500 mb-1">Deposit address assigned after account setup</p>
                <div className="h-6 skeleton rounded w-full" />
              </div>
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400 text-center">
                Only send Bitcoin (BTC) to this address
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            <button className="text-xs text-violet-400 hover:text-violet-300 transition-colors">View all →</button>
          </div>
          <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">📋</div>
              <p className="text-slate-400 text-sm">No transactions yet</p>
              <p className="text-slate-600 text-xs mt-1">Your transaction history will appear here</p>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="glass rounded-2xl p-6 border border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white mb-5">Security</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: 'Email Verified', status: 'Active', icon: '✉', color: 'text-emerald-400' },
              { label: 'Password Set', status: 'Active', icon: '🔑', color: 'text-emerald-400' },
              { label: '2FA Authentication', status: 'Coming soon', icon: '🛡', color: 'text-slate-500' },
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
      </main>
    </div>
  )
}

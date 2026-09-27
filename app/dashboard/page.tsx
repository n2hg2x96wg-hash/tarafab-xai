'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'

interface Account {
  account_balance: number
  available_balance: number
  invested_balance: number
  pending_balance: number
}

interface UserInfo {
  id: string
  email: string
  full_name: string | null
  role: string
}

interface Tx {
  id: string
  type: string
  method: string | null
  amount: number
  fee: number | null
  status: string
  reference: string | null
  notes: string | null
  created_at: string
}

function TradingViewChart() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: 'BINANCE:BTCUSDT', interval: '60', timezone: 'Etc/UTC',
      theme: 'dark', style: '1', locale: 'en', backgroundColor: 'rgba(8, 8, 16, 0)',
      gridColor: 'rgba(255, 255, 255, 0.03)', hide_top_toolbar: false, hide_legend: false,
      save_image: false, calendar: false,
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

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pending_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pending_verification: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  pending_blockchain_confirmation: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

const navItems = [
  { icon: '⊞', label: 'Overview', id: 'overview' },
  { icon: '₿', label: 'Markets', id: 'markets' },
  { icon: '📋', label: 'Transactions', id: 'transactions' },
  { icon: '↓', label: 'Deposit', id: 'deposit' },
  { icon: '↑', label: 'Withdraw', id: 'withdraw' },
  { icon: '👤', label: 'Profile', id: 'profile' },
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [activeNav, setActiveNav] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [token, setToken] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const fetchData = useCallback(async (accessToken: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` }
    const [accRes, txRes] = await Promise.all([
      fetch('/api/client/account', { headers }),
      fetch('/api/client/transactions', { headers }),
    ])
    if (accRes.ok) {
      const d = await accRes.json()
      setUser(d.user)
      setAccount(d.account)
    }
    if (txRes.ok) {
      const d = await txRes.json()
      setTxs(d.transactions || [])
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/sign-in'); return }
        setToken(session.access_token)
        await fetchData(session.access_token)
      } catch { router.push('/sign-in'); return }
      setLoading(false)
    }
    init()
  }, [router, supabase, fetchData])

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

  const displayName = user?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen bg-[#080810] flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 flex-shrink-0 bg-[#0a0a14] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-16 flex items-center px-5 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold shadow-[0_0_20px_rgba(124,58,237,0.4)]">₿</div>
            <span className="font-bold text-white">Tarafab<span className="text-violet-400">.XAi</span></span>
          </Link>
        </div>
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04]">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold flex-shrink-0">{initials}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
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
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/[0.06]">
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] transition-all">
            <span className="text-base w-5 text-center">→</span>Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
          <div className="hidden md:flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <span className="text-slate-500">Balance: </span>
              <span className="text-white font-semibold">${fmt(account?.account_balance ?? 0)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">{initials}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeNav === 'overview' && <OverviewTab account={account} txs={txs} setActiveNav={setActiveNav} />}
          {activeNav === 'markets' && <MarketsTab />}
          {activeNav === 'transactions' && <TransactionsTab txs={txs} />}
          {activeNav === 'deposit' && <DepositTab token={token} onSuccess={() => fetchData(token)} />}
          {activeNav === 'withdraw' && <WithdrawTab account={account} />}
          {activeNav === 'profile' && <ProfileTab user={user} account={account} />}
        </main>
      </div>
    </div>
  )
}

/* ─── OVERVIEW ─── */
function OverviewTab({ account, txs, setActiveNav }: { account: Account | null; txs: Tx[]; setActiveNav: (id: string) => void }) {
  const recentTxs = txs.slice(0, 5)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Account Balance', value: `$${fmt(account?.account_balance ?? 0)}`, icon: '💰', gradient: 'from-violet-500/20 to-violet-500/5' },
          { label: 'Available', value: `$${fmt(account?.available_balance ?? 0)}`, icon: '💵', gradient: 'from-emerald-500/20 to-emerald-500/5' },
          { label: 'Invested', value: `$${fmt(account?.invested_balance ?? 0)}`, icon: '📈', gradient: 'from-blue-500/20 to-blue-500/5' },
          { label: 'Pending', value: `$${fmt(account?.pending_balance ?? 0)}`, icon: '⏳', gradient: 'from-yellow-500/20 to-yellow-500/5' },
        ].map(({ label, value, icon, gradient }) => (
          <div key={label} className="glass rounded-2xl p-4 sm:p-5 border border-white/[0.06] hover:border-violet-500/20 transition-all group">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} border border-white/[0.06] flex items-center justify-center text-base mb-3 group-hover:scale-110 transition-transform`}>{icon}</div>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-sm sm:text-lg font-bold text-white leading-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass rounded-2xl border border-white/[0.06] overflow-hidden" style={{ minHeight: '460px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xs font-bold">₿</div>
              <div>
                <p className="text-sm font-semibold text-white">Bitcoin / USDT</p>
                <p className="text-xs text-slate-500">BTC/USDT</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
            </div>
          </div>
          <TradingViewChart />
        </div>

        <div className="glass rounded-2xl border border-white/[0.06] p-5 flex flex-col">
          <h3 className="font-semibold text-white text-sm mb-4">Quick Actions</h3>
          <div className="space-y-3 flex-1">
            <button onClick={() => setActiveNav('deposit')} className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all shadow-[0_0_15px_rgba(124,58,237,0.3)]">
              Deposit Funds
            </button>
            <button onClick={() => setActiveNav('withdraw')} className="w-full py-3 text-sm font-medium text-slate-300 border border-white/[0.1] rounded-xl hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-all">
              Request Withdrawal
            </button>
            <button onClick={() => setActiveNav('transactions')} className="w-full py-3 text-sm font-medium text-slate-300 border border-white/[0.1] rounded-xl hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-all">
              View Transactions
            </button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/[0.06]">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-sm">Recent Transactions</h3>
          {txs.length > 0 && (
            <button onClick={() => setActiveNav('transactions')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">View all</button>
          )}
        </div>
        {recentTxs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">📋</div>
            <p className="text-slate-400 text-sm">No transactions yet</p>
            <p className="text-slate-600 text-xs mt-1">Make a deposit to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {recentTxs.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : tx.type === 'withdrawal' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {tx.type === 'deposit' ? '↓' : tx.type === 'withdrawal' ? '↑' : '↔'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white capitalize">{tx.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">${fmt(tx.amount)}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                    {tx.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── MARKETS ─── */
function MarketsTab() {
  return (
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
  )
}

/* ─── TRANSACTIONS ─── */
function TransactionsTab({ txs }: { txs: Tx[] }) {
  const [filter, setFilter] = useState('')
  const filtered = filter ? txs.filter(t => t.type === filter) : txs
  const types = Array.from(new Set(txs.map(t => t.type)))

  return (
    <div className="space-y-4">
      {types.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filter ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'}`}>All</button>
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === t ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'}`}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl border border-white/[0.06]">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">📋</div>
            <p className="text-slate-400 text-sm">No transactions found</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Type', 'Amount', 'Fee', 'Status', 'Reference', 'Date'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx, i) => (
                    <tr key={tx.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-300 capitalize">{tx.type.replace(/_/g, ' ')}</span>
                        {tx.method && <p className="text-[10px] text-slate-600 mt-0.5">{tx.method}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-white">${fmt(tx.amount)}</td>
                      <td className="px-5 py-4 text-xs text-slate-400">{tx.fee ? `$${fmt(tx.fee)}` : '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                          {tx.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 font-mono">{tx.reference || '—'}</td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden divide-y divide-white/[0.04]">
              {filtered.map(tx => (
                <div key={tx.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white capitalize">{tx.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-500">{tx.method || ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">${fmt(tx.amount)}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                        {tx.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600">{new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.06] text-xs text-slate-600">
            Showing {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── DEPOSIT ─── */
function DepositTab({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ reference: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const BTC_ADDRESS = 'bc1qvpwmdln4nm6xa2k9q26l84pg4ud0uuqzk83053'
  const copyAddress = () => {
    navigator.clipboard.writeText(BTC_ADDRESS).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }

    setSubmitting(true)
    try {
      let receiptPath: string | undefined
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        const upRes = await fetch('/api/client/upload-receipt', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        const upData = await upRes.json()
        if (!upRes.ok) { setError(upData.error || 'Upload failed'); return }
        receiptPath = upData.path
      }

      const res = await fetch('/api/client/deposit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, method, receipt_path: receiptPath, notes: notes.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Deposit request failed'); return }

      setSuccess({ reference: data.deposit?.reference || '' })
      setAmount('')
      setNotes('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onSuccess()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="glass rounded-2xl p-8 border border-emerald-500/20 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">✓</div>
          <h3 className="text-xl font-bold text-white mb-2">Deposit Submitted</h3>
          <p className="text-slate-400 text-sm mb-4">Your deposit request has been submitted for review.</p>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-6">
            <p className="text-xs text-slate-500 mb-1">Reference</p>
            <p className="text-white font-mono font-semibold">{success.reference}</p>
          </div>
          <p className="text-xs text-slate-500 mb-6">An admin will review and approve your deposit. You will see the funds reflected in your balance once approved.</p>
          <button onClick={() => setSuccess(null)} className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all">
            Submit Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-3">
        <span className="text-violet-400 text-lg flex-shrink-0 mt-0.5">ℹ</span>
        <div>
          <p className="text-violet-300 text-sm font-medium">How deposits work</p>
          <p className="text-slate-400 text-xs mt-1">Send Bitcoin to the address below, then submit your deposit details with a receipt. An admin will review and approve your deposit within 24 hours.</p>
        </div>
      </div>

      {/* BTC Deposit Address */}
      <div className="glass rounded-2xl p-6 border border-orange-500/20 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xs font-bold">₿</div>
          <h3 className="font-semibold text-white">Send Bitcoin Here</h3>
        </div>
        <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-xl p-2 flex items-center justify-center">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=bitcoin:${BTC_ADDRESS}`} alt="BTC QR Code" className="w-full h-full" />
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-3">
          <p className="text-[10px] text-slate-500 mb-1.5">BTC Deposit Address</p>
          <p className="text-white font-mono text-xs break-all select-all leading-relaxed">{BTC_ADDRESS}</p>
        </div>
        <button onClick={copyAddress} className="px-4 py-2 text-xs font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-all">
          {copied ? '✓ Copied!' : 'Copy Address'}
        </button>
        <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-[10px] text-yellow-400 font-medium">⚠ Only send BTC (Bitcoin) to this address. Other assets sent here will be permanently lost.</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/[0.06]">
        <h3 className="font-semibold text-white mb-5">New Deposit Request</h3>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <span className="flex-shrink-0">⚠</span><span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Amount (USD)</label>
            <input
              type="number" step="0.01" min="0.01" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00" required className="input-field" disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Deposit Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="input-field" disabled={submitting}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="wire_transfer">Wire Transfer</option>
              <option value="crypto">Cryptocurrency</option>
              <option value="cash">Cash Deposit</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Receipt / Proof of Payment</label>
            <div className="relative">
              <input
                ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="input-field text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-violet-600/20 file:text-violet-300 file:text-xs file:font-medium file:cursor-pointer"
                disabled={submitting}
              />
            </div>
            <p className="text-xs text-slate-600 mt-1">JPG, PNG, WEBP, or PDF — max 5MB</p>
            {file && <p className="text-xs text-emerald-400 mt-1">Selected: {file.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes (optional)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional details..." rows={3}
              className="input-field resize-none" disabled={submitting}
            />
          </div>

          <button
            type="submit" disabled={submitting}
            className="w-full py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
            ) : 'Submit Deposit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ─── WITHDRAW ─── */
function WithdrawTab({ account }: { account: Account | null }) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
        <span className="text-yellow-400 text-lg flex-shrink-0 mt-0.5">⚠</span>
        <div>
          <p className="text-yellow-300 text-sm font-medium">Withdrawals</p>
          <p className="text-slate-400 text-xs mt-1">To request a withdrawal, please contact support. Withdrawal requests are processed within 1-3 business days.</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/[0.06]">
        <h3 className="font-semibold text-white mb-4">Account Summary</h3>
        <div className="space-y-3">
          {[
            ['Account Balance', `$${fmt(account?.account_balance ?? 0)}`],
            ['Available for Withdrawal', `$${fmt(account?.available_balance ?? 0)}`],
            ['Pending', `$${fmt(account?.pending_balance ?? 0)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <span className="text-slate-400 text-sm">{label}</span>
              <span className="text-white text-sm font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/[0.06] text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-2xl">📧</div>
        <h3 className="text-white font-semibold mb-2">Contact Support</h3>
        <p className="text-slate-400 text-sm mb-4">Please reach out to our support team to initiate a withdrawal request.</p>
        <a href="mailto:support@tarafab.com" className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all">
          Email Support
        </a>
      </div>
    </div>
  )
}

/* ─── PROFILE ─── */
function ProfileTab({ user, account }: { user: UserInfo | null; account: Account | null }) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="glass rounded-2xl p-6 border border-white/[0.06]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-lg font-bold">
            {(user?.full_name ?? user?.email ?? 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{user?.full_name || 'Unknown'}</h3>
            <p className="text-sm text-slate-400">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-3">
          {[
            ['Full Name', user?.full_name || '—'],
            ['Email', user?.email || '—'],
            ['Account Type', 'Client'],
            ['Account Balance', `$${fmt(account?.account_balance ?? 0)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <span className="text-slate-500 text-sm">{label}</span>
              <span className="text-white text-sm font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/[0.06]">
        <h3 className="font-semibold text-white mb-4 text-sm">Security</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Email', status: 'Verified', icon: '✉', color: 'text-emerald-400' },
            { label: 'Password', status: 'Set', icon: '🔑', color: 'text-emerald-400' },
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
    </div>
  )
}

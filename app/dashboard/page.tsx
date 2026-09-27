'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType, SVGProps } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { FormError, Spinner } from '@/components/AuthShell'
import {
  IconAlert, IconArrowDown, IconArrowUp, IconChart, IconCheck, IconClose, IconCopy, IconGrid,
  IconInfo, IconList, IconLogOut, IconMail, IconMenu, IconSwap, IconUser, Logo,
} from '@/components/Icons'

interface Account {
  account_balance: number
  available_balance: number
  invested_balance: number
  pending_balance: number
  profit_balance?: number
}

interface UserInfo {
  id: string
  email: string
  full_name: string | null
  role: string
  email_confirmed?: boolean
  created_at?: string
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
  address?: string | null
  created_at: string
}

const BTC_ADDRESS = 'bc1qvpwmdln4nm6xa2k9q26l84pg4ud0uuqzk83053'
const SUPPORT_EMAIL = 'tarafab.support@gmail.com'

function TradingViewChart({ height }: { height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: 'COINBASE:BTCUSD', interval: '60', timezone: 'Etc/UTC',
      theme: 'dark', style: '1', locale: 'en', backgroundColor: 'rgba(15, 18, 22, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)', hide_side_toolbar: true, allow_symbol_change: false,
      save_image: false, calendar: false,
    })
    el.appendChild(script)
    return () => { el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' }
  }, [])
  return (
    <div className="tradingview-widget-container" ref={ref} style={{ height }}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-emerald-400 border-emerald-500/30',
  approved: 'text-emerald-400 border-emerald-500/30',
  rejected: 'text-red-400 border-red-500/30',
  failed: 'text-red-400 border-red-500/30',
  pending: 'text-amber-400 border-amber-500/30',
  pending_review: 'text-amber-400 border-amber-500/30',
  pending_verification: 'text-amber-400 border-amber-500/30',
  pending_blockchain_confirmation: 'text-sky-400 border-sky-500/30',
}

function StatusTag({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ')
  return <span className={`tag capitalize ${STATUS_STYLE[status] || 'text-fg-muted border-ink-600'}`}>{label}</span>
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>
const navItems: { icon: Icon; label: string; id: string }[] = [
  { icon: IconGrid, label: 'Overview', id: 'overview' },
  { icon: IconChart, label: 'Markets', id: 'markets' },
  { icon: IconList, label: 'Transactions', id: 'transactions' },
  { icon: IconArrowDown, label: 'Deposit', id: 'deposit' },
  { icon: IconArrowUp, label: 'Withdraw', id: 'withdraw' },
  { icon: IconUser, label: 'Profile', id: 'profile' },
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U'
}

function TxIcon({ type }: { type: string }) {
  const I = type === 'deposit' ? IconArrowDown : type === 'withdrawal' ? IconArrowUp : IconSwap
  return (
    <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-fg-muted shrink-0">
      <I width={16} height={16} />
    </span>
  )
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

  const go = (id: string) => { setActiveNav(id); setSidebarOpen(false); window.scrollTo({ top: 0 }) }

  if (loading) {
    return (
      <div className="site min-h-screen bg-ink-950 flex items-center justify-center text-fg-muted">
        <Spinner />
      </div>
    )
  }

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'there'
  const initials = initialsOf(displayName)
  const current = navItems.find(n => n.id === activeNav)

  return (
    <div className="site min-h-screen bg-ink-950 text-fg lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-ink-900 border-r border-ink-700 flex flex-col transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-ink-700">
          <Link href="/" aria-label="Tarafab.XAi home"><Logo /></Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-fg-muted hover:text-fg" aria-label="Close menu"><IconClose /></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: I, label, id }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors text-left ${
                activeNav === id ? 'bg-ink-800 text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-ink-850'
              }`}
              aria-current={activeNav === id ? 'page' : undefined}
            >
              <I width={17} height={17} className={activeNav === id ? 'text-accent' : ''} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-ink-700">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-xs font-semibold text-fg shrink-0">{initials}</span>
            <div className="min-w-0">
              <p className="text-sm text-fg truncate">{displayName}</p>
              <p className="text-xs text-fg-faint truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm text-fg-muted hover:text-fg hover:bg-ink-850 transition-colors">
            <IconLogOut width={17} height={17} />Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700 bg-ink-950">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 -ml-1 text-fg-muted hover:text-fg" aria-label="Open menu"><IconMenu width={22} height={22} /></button>
            <h1 className="text-[15px] font-semibold text-fg truncate">{current?.label ?? 'Dashboard'}</h1>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-fg-faint leading-none mb-1">Account balance</div>
            <div className="text-sm font-semibold text-fg tabular-nums leading-none">${fmt(account?.account_balance ?? 0)}</div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl">
          {activeNav === 'overview' && <OverviewTab name={displayName} account={account} txs={txs} go={go} />}
          {activeNav === 'markets' && <MarketsTab />}
          {activeNav === 'transactions' && <TransactionsTab txs={txs} />}
          {activeNav === 'deposit' && <DepositTab token={token} onSuccess={() => fetchData(token)} />}
          {activeNav === 'withdraw' && <WithdrawTab account={account} txs={txs} token={token} onSuccess={() => fetchData(token)} />}
          {activeNav === 'profile' && <ProfileTab user={user} account={account} />}
        </main>
      </div>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm text-fg">{title}</p>
      {body && <p className="text-[13px] text-fg-faint mt-1">{body}</p>}
    </div>
  )
}

/* Overview */
function OverviewTab({ name, account, txs, go }: { name: string; account: Account | null; txs: Tx[]; go: (id: string) => void }) {
  const recentTxs = txs.slice(0, 5)
  const pendingCount = txs.filter(t => t.status.startsWith('pending')).length
  return (
    <div className="space-y-6">
      <div>
        <p className="text-fg-muted text-sm">Signed in as {name}</p>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        {[
          ['Account balance', account?.account_balance ?? 0],
          ['Available', account?.available_balance ?? 0],
          ['Profit', account?.profit_balance ?? 0],
          ['Invested', account?.invested_balance ?? 0],
          ['Pending', account?.pending_balance ?? 0],
        ].map(([label, value], i) => (
          <div key={label as string} className={`bg-ink-900 p-4 sm:p-5 ${i === 0 ? 'col-span-2 lg:col-span-1' : ''}`}>
            <dt className="text-[13px] text-fg-faint">{label}</dt>
            <dd className="mt-1.5 text-lg sm:text-2xl font-semibold text-fg tabular-nums">${fmt(value as number)}</dd>
          </div>
        ))}
      </dl>

      {pendingCount > 0 && (
        <div className="flex gap-3 p-4 rounded-md border border-amber-500/30 bg-amber-500/[0.05] text-sm">
          <IconInfo className="shrink-0 text-amber-400 mt-px" width={17} height={17} />
          <p className="text-fg-muted">
            You have {pendingCount} transaction{pendingCount === 1 ? '' : 's'} waiting for review. Your balance updates once {pendingCount === 1 ? 'it is' : 'they are'} approved.
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC/USD</span>
            <span className="text-fg-faint">Chart by TradingView</span>
          </div>
          <TradingViewChart height={400} />
        </div>

        <div className="panel p-5 flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold text-fg mb-1">Actions</h3>
          <button onClick={() => go('deposit')} className="btn btn-solid w-full">Deposit Bitcoin</button>
          <button onClick={() => go('withdraw')} className="btn btn-outline w-full">Request a withdrawal</button>
          <button onClick={() => go('transactions')} className="btn btn-outline w-full">View all transactions</button>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between px-5 h-14 border-b border-ink-700">
          <h3 className="text-[15px] font-semibold text-fg">Recent transactions</h3>
          {txs.length > 0 && <button onClick={() => go('transactions')} className="text-[13px] text-fg-muted hover:text-fg">View all</button>}
        </div>
        {recentTxs.length === 0 ? (
          <EmptyState title="No transactions yet" body="Your deposits and withdrawals will appear here." />
        ) : (
          <ul className="divide-y divide-ink-700">
            {recentTxs.map(tx => (
              <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <TxIcon type={tx.type} />
                  <div className="min-w-0">
                    <p className="text-sm text-fg capitalize">{tx.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-fg-faint">{new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-fg tabular-nums mb-1">${fmt(tx.amount)}</p>
                  <StatusTag status={tx.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* Markets */
function MarketsTab() {
  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
          <span className="text-fg">BTC/USD</span>
          <span className="text-fg-faint">Chart by TradingView</span>
        </div>
        <TradingViewChart height={520} />
      </div>
      <BitcoinMarketCard />
    </div>
  )
}

/* Transactions */
function TransactionsTab({ txs }: { txs: Tx[] }) {
  const [filter, setFilter] = useState('')
  const filtered = filter ? txs.filter(t => t.type === filter) : txs
  const types = Array.from(new Set(txs.map(t => t.type)))

  return (
    <div className="space-y-4">
      {types.length > 1 && (
        <div className="inline-flex border border-ink-700 rounded-md overflow-hidden text-[13px]" role="tablist">
          {['', ...types].map(t => (
            <button
              key={t || 'all'}
              onClick={() => setFilter(t)}
              role="tab"
              aria-selected={filter === t}
              className={`px-3.5 h-9 capitalize border-r border-ink-700 last:border-r-0 transition-colors ${filter === t ? 'bg-ink-800 text-fg' : 'text-fg-muted hover:text-fg'}`}
            >
              {t ? t.replace(/_/g, ' ') : 'All'}
            </button>
          ))}
        </div>
      )}

      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No transactions yet" body="Once you submit a deposit, it will show up here with its status." />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs text-fg-faint">
                    {['Type', 'Amount', 'Fee', 'Status', 'Reference', 'Date'].map(h => (
                      <th key={h} className={`px-5 py-3 font-medium ${h === 'Amount' || h === 'Fee' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {filtered.map(tx => (
                    <tr key={tx.id} className="hover:bg-ink-850 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-fg capitalize">{tx.type.replace(/_/g, ' ')}</span>
                        {tx.method && <p className="text-xs text-fg-faint capitalize">{tx.method.replace(/_/g, ' ')}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-fg tabular-nums">${fmt(tx.amount)}</td>
                      <td className="px-5 py-3.5 text-right text-fg-muted tabular-nums">{tx.fee ? `$${fmt(tx.fee)}` : '-'}</td>
                      <td className="px-5 py-3.5"><StatusTag status={tx.status} /></td>
                      <td className="px-5 py-3.5 text-xs text-fg-muted font-mono">{tx.reference || '-'}</td>
                      <td className="px-5 py-3.5 text-fg-muted whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-ink-700">
              {filtered.map(tx => (
                <li key={tx.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-fg capitalize">{tx.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-fg-faint">{new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                      {tx.reference && <p className="text-xs text-fg-faint font-mono mt-1">{tx.reference}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-fg tabular-nums mb-1">${fmt(tx.amount)}</p>
                      <StatusTag status={tx.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-ink-700 text-xs text-fg-faint">
              {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* Deposit */
function DepositTab({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bitcoin')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ reference: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const copyAddress = () => {
    navigator.clipboard.writeText(BTC_ADDRESS).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter the amount you sent, in US dollars.'); return }

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
        if (!upRes.ok) { setError(upData.error || 'The receipt could not be uploaded.'); return }
        receiptPath = upData.path
      }

      const res = await fetch('/api/client/deposit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, method, receipt_path: receiptPath, notes: notes.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'The deposit could not be submitted.'); return }

      setSuccess({ reference: data.deposit?.reference || '' })
      setAmount('')
      setNotes('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onSuccess()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-lg">
        <div className="panel p-6 sm:p-8">
          <span className="w-10 h-10 rounded-md border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-5"><IconCheck /></span>
          <h3 className="text-xl font-semibold text-fg mb-2">Deposit submitted</h3>
          <p className="text-[15px] text-fg-muted mb-5">It is now pending review. Your balance will update once it is approved, and you can follow its status under Transactions.</p>
          {success.reference && (
            <div className="p-4 rounded-md bg-ink-850 border border-ink-700 mb-6">
              <p className="text-xs text-fg-faint mb-1">Reference</p>
              <p className="text-fg font-mono">{success.reference}</p>
            </div>
          )}
          <button onClick={() => setSuccess(null)} className="btn btn-outline">Submit another deposit</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg">1. Send Bitcoin to this address</h3>
        <p className="text-[13px] text-fg-faint mt-1 mb-5">Scan the code with your wallet, or copy the address.</p>
        <div className="w-44 h-44 mx-auto sm:mx-0 mb-5 bg-white rounded-md p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=bitcoin:${BTC_ADDRESS}`} alt="QR code for the Bitcoin deposit address" className="w-full h-full" />
        </div>
        <label className="field-label">Bitcoin (BTC) address</label>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-ink-950 border border-ink-600 font-mono text-[13px] text-fg break-all select-all">{BTC_ADDRESS}</div>
          <button onClick={copyAddress} className="btn btn-outline btn-sm !h-auto shrink-0" aria-label="Copy address">
            {copied ? <><IconCheck width={15} height={15} />Copied</> : <><IconCopy width={15} height={15} />Copy</>}
          </button>
        </div>
        <div className="flex gap-2.5 mt-5 p-3 rounded-md border border-amber-500/30 bg-amber-500/[0.05] text-[13px] text-fg-muted">
          <IconAlert className="shrink-0 text-amber-400 mt-px" width={16} height={16} />
          <span>Send only Bitcoin on the Bitcoin network to this address. Other coins or networks sent here cannot be recovered.</span>
        </div>
      </div>

      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg">2. Tell us about the transfer</h3>
        <p className="text-[13px] text-fg-faint mt-1 mb-5">Submitting this does not change your balance. It is credited after our team checks it.</p>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && <FormError message={error} />}

          <div>
            <label htmlFor="amount" className="field-label">Amount sent (USD)</label>
            <input id="amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required className="field tabular-nums" disabled={submitting} />
          </div>

          <div>
            <label htmlFor="method" className="field-label">Payment method</label>
            <select id="method" value={method} onChange={e => setMethod(e.target.value)} className="field" disabled={submitting}>
              <option value="bitcoin">Bitcoin (BTC)</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="wire_transfer">Wire transfer</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="receipt" className="field-label">Receipt or screenshot</label>
            <input
              id="receipt" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-fg-muted file:mr-3 file:h-9 file:px-3 file:rounded-md file:border file:border-ink-600 file:bg-ink-850 file:text-fg file:text-[13px] file:font-medium file:cursor-pointer hover:file:bg-ink-800"
              disabled={submitting}
            />
            <p className="text-xs text-fg-faint mt-1.5">JPG, PNG, WEBP or PDF. Maximum 5 MB. Include the transaction ID if you have it.</p>
          </div>

          <div>
            <label htmlFor="notes" className="field-label">Notes (optional)</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="For example, the transaction ID or the wallet you sent from" rows={3} className="field resize-none" disabled={submitting} />
          </div>

          <button type="submit" disabled={submitting} className="btn btn-solid w-full">
            {submitting ? <><Spinner />Submitting</> : 'Submit deposit for review'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* Withdraw */
const OPEN_STATUSES = ['pending_review', 'pending', 'requested', 'under_review']
const SOURCES = [
  { id: 'available_balance', label: 'Available balance' },
  { id: 'profit_balance', label: 'Profit balance' },
] as const
type Source = typeof SOURCES[number]['id']

function WithdrawTab({ account, txs, token, onSuccess }: { account: Account | null; txs: Tx[]; token: string; onSuccess: () => void }) {
  const [source, setSource] = useState<Source>('available_balance')
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const withdrawals = txs.filter(t => t.type === 'withdrawal')
  const reserved = (src: Source) => withdrawals.filter(t => t.method === src && OPEN_STATUSES.includes(t.status)).reduce((s, t) => s + Number(t.amount), 0)
  const balanceOf = (src: Source) => Number((src === 'profit_balance' ? account?.profit_balance : account?.available_balance) ?? 0)
  const withdrawable = (src: Source) => Math.max(0, Math.round((balanceOf(src) - reserved(src)) * 100) / 100)
  const max = withdrawable(source)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!amt || amt <= 0) { setError('Enter the amount you want to withdraw.'); return }
    if (amt > max) { setError(`You can withdraw up to $${fmt(max)} from this balance.`); return }
    if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/.test(address.trim())) { setError('Enter a valid Bitcoin address. It starts with bc1, 1 or 3.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/client/withdraw', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, source, address: address.trim(), notes: notes.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'The request could not be submitted.'); return }
      setDone(data.withdrawal?.reference || '')
      setAmount('')
      setNotes('')
      onSuccess()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
      <div className="space-y-4">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-4">What you can withdraw</h3>
          <dl className="divide-y divide-ink-700">
            {SOURCES.map(s => (
              <div key={s.id} className="py-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-fg-muted">{s.label}</dt>
                  <dd className="text-sm font-medium text-fg tabular-nums">${fmt(balanceOf(s.id))}</dd>
                </div>
                {reserved(s.id) > 0 && (
                  <p className="text-xs text-fg-faint mt-1">${fmt(reserved(s.id))} is in pending requests, so ${fmt(withdrawable(s.id))} can be requested now.</p>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-fg-muted">Account balance</dt>
              <dd className="text-sm text-fg-muted tabular-nums">${fmt(account?.account_balance ?? 0)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-2">How withdrawals work</h3>
          <ol className="space-y-2 text-sm text-fg-muted list-decimal pl-5">
            <li>Choose the balance, the amount and your Bitcoin address.</li>
            <li>The request shows as pending. Your balance does not change yet.</li>
            <li>Our team reviews it. Once approved, the amount is deducted and sent to your address.</li>
            <li>If it is declined, nothing is deducted and you can see the reason in your history.</li>
          </ol>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-2">Need help?</h3>
          <p className="text-sm text-fg-muted mb-4">Questions about a withdrawal or your account? Email our support team and include your reference number if you have one.</p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account support')}`} className="btn btn-outline w-full sm:w-auto">
            <IconMail width={17} height={17} />{SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      <div className="space-y-4 order-first lg:order-none">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg">Request a withdrawal</h3>
          <p className="text-[13px] text-fg-faint mt-1 mb-5">Paid out in Bitcoin to the address you enter.</p>

          {done !== null && (
            <div role="status" className="flex gap-2.5 p-3 mb-5 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] text-sm text-emerald-300">
              <IconCheck className="shrink-0 mt-px" width={16} height={16} />
              <span>Request submitted{done ? ` (reference ${done})` : ''}. It is now pending review.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && <FormError message={error} />}

            <fieldset>
              <legend className="field-label">Withdraw from</legend>
              <div className="grid grid-cols-2 gap-2">
                {SOURCES.map(s => (
                  <label key={s.id} className={`cursor-pointer rounded-md border px-3 py-2.5 transition-colors ${source === s.id ? 'border-accent bg-ink-850' : 'border-ink-600 hover:border-fg-faint'}`}>
                    <input type="radio" name="source" value={s.id} checked={source === s.id} onChange={() => { setSource(s.id); setError('') }} className="sr-only" />
                    <span className="block text-sm text-fg">{s.label.replace(' balance', '')}</span>
                    <span className="block text-xs text-fg-faint tabular-nums">${fmt(withdrawable(s.id))} available</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="w-amount" className="field-label !mb-0">Amount (USD)</label>
                <button type="button" onClick={() => setAmount(max > 0 ? max.toFixed(2) : '')} className="text-[13px] text-fg-muted hover:text-fg disabled:opacity-40" disabled={max <= 0}>Max</button>
              </div>
              <input id="w-amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="field tabular-nums" disabled={submitting} />
            </div>

            <div>
              <label htmlFor="w-address" className="field-label">Your Bitcoin (BTC) address</label>
              <input id="w-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="bc1..." autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" disabled={submitting} />
              <p className="text-xs text-fg-faint mt-1.5">Double-check it. Bitcoin sent to a wrong address cannot be recovered.</p>
            </div>

            <div>
              <label htmlFor="w-notes" className="field-label">Notes (optional)</label>
              <textarea id="w-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field resize-none" disabled={submitting} />
            </div>

            <button type="submit" disabled={submitting || max <= 0} className="btn btn-solid w-full">
              {submitting ? <><Spinner />Submitting</> : max <= 0 ? 'Nothing available to withdraw' : 'Submit withdrawal request'}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="px-5 h-14 flex items-center border-b border-ink-700">
            <h3 className="text-[15px] font-semibold text-fg">Your withdrawal requests</h3>
          </div>
          {withdrawals.length === 0 ? (
            <EmptyState title="No withdrawal requests yet" />
          ) : (
            <ul className="divide-y divide-ink-700">
              {withdrawals.map(w => (
                <li key={w.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{w.method === 'profit_balance' ? 'From profit' : 'From available'}</p>
                    <p className="text-xs text-fg-faint">{new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{w.reference ? ` · ${w.reference}` : ''}</p>
                    {w.address && <p className="text-xs text-fg-faint font-mono truncate max-w-[220px]">{w.address}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-fg tabular-nums mb-1">${fmt(w.amount)}</p>
                    <StatusTag status={w.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/* Profile */
function ProfileTab({ user, account }: { user: UserInfo | null; account: Account | null }) {
  const rows: [string, string][] = [
    ['Full name', user?.full_name || 'Not set'],
    ['Email', user?.email || 'Not set'],
    ['Email confirmed', user?.email_confirmed === undefined ? 'Unknown' : user.email_confirmed ? 'Yes' : 'No'],
    ['Member since', user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown'],
    ['Account balance', `$${fmt(account?.account_balance ?? 0)}`],
    ['Profit balance', `$${fmt(account?.profit_balance ?? 0)}`],
  ]
  return (
    <div className="max-w-lg space-y-4">
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-4">Account details</h3>
        <dl className="divide-y divide-ink-700">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="text-sm text-fg text-right truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-2">Password</h3>
        <p className="text-sm text-fg-muted mb-5">We will email you a link to choose a new password.</p>
        <Link href="/forgot-password" className="btn btn-outline">Change password</Link>
      </div>
    </div>
  )
}

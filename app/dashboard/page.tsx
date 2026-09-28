'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType, SVGProps } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { FormError, Spinner } from '@/components/AuthShell'
import { TrustBar } from '@/components/LandingExtras'
import { TradingStatusCard } from '@/components/TradingStatus'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { statusLabel } from '@/lib/i18n/format'
import { LanguageSelector } from '@/components/LanguageSelector'
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
  trading_status?: 'active' | 'inactive' | null
  trading_strategy_name?: string | null
  trading_status_updated_at?: string | null
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
  direction?: 'credit' | 'debit' | null
  created_at: string
}

const BTC_ADDRESS = 'bc1qvpwmdln4nm6xa2k9q26l84pg4ud0uuqzk83053'
const SUPPORT_EMAIL = 'tarafab.support@gmail.com'

function TradingViewChart({ height }: { height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const { locale } = useI18n()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: 'COINBASE:BTCUSD', interval: '60', timezone: 'Etc/UTC',
      theme: 'dark', style: '1', locale, backgroundColor: 'rgba(13, 16, 22, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)', hide_side_toolbar: true, allow_symbol_change: false,
      save_image: false, calendar: false,
    })
    el.appendChild(script)
    return () => { el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' }
  }, [locale])
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
  const { t } = useI18n()
  return <span className={`tag ${STATUS_STYLE[status] || 'text-fg-muted border-ink-600'}`}>{statusLabel(t, status)}</span>
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>
const navItems: { icon: Icon; label: TKey; id: string }[] = [
  { icon: IconGrid, label: 'dash.nav.overview', id: 'overview' },
  { icon: IconChart, label: 'dash.nav.markets', id: 'markets' },
  { icon: IconList, label: 'dash.nav.transactions', id: 'transactions' },
  { icon: IconArrowDown, label: 'dash.nav.deposit', id: 'deposit' },
  { icon: IconArrowUp, label: 'dash.nav.withdraw', id: 'withdraw' },
  { icon: IconUser, label: 'dash.nav.profile', id: 'profile' },
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U'
}

// Client-facing wording only — the transaction type in the database is
// unchanged. A credit to the profit balance reads as "Profit", any other
// credit as "Return", and a deduction keeps the neutral "Adjustment" so a
// balance being reduced is never presented as a gain.
type T = ReturnType<typeof useI18n>['t']
function txLabel(tx: Tx, t: T) {
  if (tx.type === 'adjustment') {
    if (tx.direction === 'credit') return t(tx.method === 'profit_balance' ? 'dash.txType.profit' : 'dash.txType.return')
    return t('dash.txType.adjustment')
  }
  return t(`dash.txType.${tx.type}` as TKey) || tx.type.replace(/_/g, ' ')
}

function methodLabel(method: string, t: T) {
  return t(`dash.method.${method}` as TKey) || method.replace(/_/g, ' ')
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
  const [loadError, setLoadError] = useState('')
  const [txError, setTxError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  const lastLoad = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  // Read through a ref so switching language never re-runs the data load.
  const tRef = useRef(t)
  tRef.current = t

  // Account and transactions load independently: one failing never blanks
  // the other, and a failed refresh keeps the figures already on screen.
  // Concurrent calls (tab focus + a submit finishing) share one request.
  const fetchData = useCallback(() => {
    if (inFlight.current) return inFlight.current
    const run = (async () => {
      setRefreshing(true)
      const [acc, tx] = await Promise.allSettled([
        authFetch('/api/client/account').then(r => readJson<{ user: UserInfo; account: Account }>(r)),
        authFetch('/api/client/transactions').then(r => readJson<{ transactions: Tx[] }>(r)),
      ])
      if (acc.status === 'fulfilled') { setUser(acc.value.user); setAccount(acc.value.account); setLoadError('') }
      else setLoadError(errorText(acc.reason, tRef.current))
      if (tx.status === 'fulfilled') { setTxs(tx.value.transactions || []); setTxError('') }
      else setTxError(errorText(tx.reason, tRef.current))
      const expired = [acc, tx].some(r => r.status === 'rejected' && r.reason instanceof RequestError && r.reason.status === 401)
      if (expired) router.replace('/sign-in')
      lastLoad.current = Date.now()
      setRefreshing(false)
    })()
    inFlight.current = run
    run.finally(() => { inFlight.current = null })
    return run
  }, [router])

  const init = useCallback(async () => {
    setSessionError(false)
    setLoading(true)
    // Supabase keeps retrying a token refresh while offline; cap the wait so
    // a dead connection shows a retry instead of an endless spinner.
    const timeout = new Promise<{ data: { session: null }; error: Error }>(resolve =>
      setTimeout(() => resolve({ data: { session: null }, error: new Error('timeout') }), 10_000))
    const { data, error } = await Promise.race([
      supabase.auth.getSession().catch(e => ({ data: { session: null }, error: e })),
      timeout,
    ])
    // A network failure while restoring the session is not the same as being
    // signed out: offer a retry instead of sending the user to sign in.
    if (error) { setSessionError(true); setLoading(false); return }
    if (!data.session) { router.replace('/sign-in'); return }
    await fetchData()
    setLoading(false)
  }, [supabase, router, fetchData])

  useEffect(() => { init() }, [init])

  // One listener per mounted dashboard, removed on unmount. Signing out in
  // another tab signs this tab out too.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') router.replace('/sign-in')
    })
    return () => subscription.unsubscribe()
  }, [supabase, router])

  // Returning to the tab (or regaining a connection) refreshes balances,
  // at most once every 30 seconds.
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 30_000) fetchData()
    }
    document.addEventListener('visibilitychange', maybeRefresh)
    window.addEventListener('online', maybeRefresh)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh)
      window.removeEventListener('online', maybeRefresh)
    }
  }, [fetchData])

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

  if (sessionError) {
    return (
      <div className="site min-h-screen bg-ink-950 text-fg flex items-center justify-center px-4">
        <div className="panel max-w-sm w-full p-6 text-center">
          <p className="font-medium mb-1">{t('dash.restoreFailed')}</p>
          <p className="text-sm text-fg-muted mb-5">{t('dash.restoreFailedBody')}</p>
          <button onClick={init} className="btn btn-solid w-full">{t('common.tryAgain')}</button>
        </div>
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
          <Link href="/" aria-label={t('common.home')}><Logo /></Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-fg-muted hover:text-fg" aria-label={t('common.closeMenu')}><IconClose /></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: I, label, id }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`w-full flex items-center gap-3 px-3 min-h-10 py-2 rounded-md text-sm transition-colors text-left ${
                activeNav === id ? 'nav-item-on font-medium' : 'nav-item'
              }`}
              aria-current={activeNav === id ? 'page' : undefined}
            >
              <I width={17} height={17} className={`shrink-0 ${activeNav === id ? 'text-brand-300' : ''}`} />
              {t(label)}
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
          <LanguageSelector align="left" direction="up" className="px-2 mb-2" />
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm text-fg-muted hover:text-fg hover:bg-ink-850 transition-colors">
            <IconLogOut width={17} height={17} />{t('common.signOut')}
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700 bg-ink-950">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 -ml-1 text-fg-muted hover:text-fg" aria-label={t('common.openMenu')}><IconMenu width={22} height={22} /></button>
            <h1 className="text-[15px] font-semibold text-fg truncate">{current ? t(current.label) : t('dash.dashboard')}</h1>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] text-fg-faint leading-none mb-1 whitespace-nowrap">{t('dash.accountBalance')}</div>
            <div className="text-sm font-semibold text-fg tabular-nums leading-none">${fmt(account?.account_balance ?? 0)}</div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl">
          {(loadError || txError) && (
            <div role="alert" className="alert alert-warning mb-4 flex-wrap items-center justify-between">
              <span className="flex items-start gap-2 min-w-0">
                <IconAlert className="shrink-0 mt-px" width={16} height={16} aria-hidden="true" />
                <span>{loadError ? `${loadError}${account ? ` ${t('dash.showingLast')}` : ''}` : t('dash.txErrorPrefix', { error: txError })}</span>
              </span>
              <button onClick={() => fetchData()} disabled={refreshing} className="btn btn-sm btn-outline">
                {refreshing ? t('common.refreshing') : t('common.tryAgain')}
              </button>
            </div>
          )}
          <ErrorBoundary key={activeNav} label={current ? t(current.label) : undefined}>
            {activeNav === 'overview' && <OverviewTab name={displayName} account={account} txs={txs} go={go} />}
            {activeNav === 'markets' && <MarketsTab />}
            {activeNav === 'transactions' && <TransactionsTab txs={txs} />}
            {activeNav === 'deposit' && <DepositTab onSuccess={fetchData} />}
            {activeNav === 'withdraw' && <WithdrawTab account={account} txs={txs} onSuccess={fetchData} />}
            {activeNav === 'profile' && <ProfileTab user={user} account={account} />}
          </ErrorBoundary>
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
  const pendingCount = txs.filter(x => x.status.startsWith('pending')).length
  const { t, intl } = useI18n()
  return (
    <div className="space-y-6">
      <div>
        <p className="text-fg-muted text-sm">{t('dash.signedInAs', { name })}</p>
      </div>

      <TradingStatusCard
        status={account?.trading_status}
        strategyName={account?.trading_strategy_name}
        updatedAt={account?.trading_status_updated_at}
      />

      <TrustBar />

      <dl className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-ink-700 border border-ink-700 rounded-lg overflow-hidden">
        {([
          ['dash.accountBalance', account?.account_balance ?? 0],
          ['dash.available', account?.available_balance ?? 0],
          ['dash.profit', account?.profit_balance ?? 0],
          ['dash.invested', account?.invested_balance ?? 0],
          ['dash.pending', account?.pending_balance ?? 0],
        ] as [TKey, number][]).map(([label, value], i) => (
          <div key={label} className={`bg-ink-900 p-4 sm:p-5 min-w-0 ${i === 0 ? 'col-span-2 lg:col-span-1' : ''}`}>
            <dt className="text-[13px] text-fg-faint truncate">{t(label)}</dt>
            <dd className="mt-1.5 text-lg sm:text-2xl font-semibold text-fg tabular-nums">${fmt(value as number)}</dd>
          </div>
        ))}
      </dl>

      {pendingCount > 0 && (
        <div role="status" className="alert alert-warning">
          <IconInfo className="shrink-0 text-amber-400 mt-px" width={17} height={17} aria-hidden="true" />
          <p className="text-fg-muted">
            {pendingCount === 1 ? t('dash.pendingOne') : t('dash.pendingMany', { n: pendingCount })}
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC/USD</span>
            <span className="text-fg-faint">{t('landing.livePrice')}</span>
          </div>
          <ErrorBoundary label={t('dash.theChart')}><TradingViewChart height={400} /></ErrorBoundary>
        </div>

        <div className="panel p-5 flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold text-fg mb-1">{t('dash.actions')}</h3>
          <button onClick={() => go('deposit')} className="btn btn-solid w-full">{t('dash.depositBitcoin')}</button>
          <button onClick={() => go('withdraw')} className="btn btn-outline w-full">{t('dash.requestWithdrawal')}</button>
          <button onClick={() => go('transactions')} className="btn btn-outline w-full">{t('dash.viewAllTx')}</button>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between px-5 h-14 border-b border-ink-700">
          <h3 className="text-[15px] font-semibold text-fg">{t('dash.recentTx')}</h3>
          {txs.length > 0 && <button onClick={() => go('transactions')} className="text-[13px] text-fg-muted hover:text-fg">{t('common.viewAll')}</button>}
        </div>
        {recentTxs.length === 0 ? (
          <EmptyState title={t('dash.noTx')} body={t('dash.noTxBody')} />
        ) : (
          <ul className="divide-y divide-ink-700">
            {recentTxs.map(tx => (
              <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <TxIcon type={tx.type} />
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{txLabel(tx, t)}</p>
                    <p className="text-xs text-fg-faint">{new Date(tx.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
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
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
          <span className="text-fg">BTC/USD</span>
          <span className="text-fg-faint">{t('landing.livePrice')}</span>
        </div>
        <ErrorBoundary label={t('dash.theChart')}><TradingViewChart height={520} /></ErrorBoundary>
      </div>
      <ErrorBoundary label={t('market.bitcoinMarket')}><BitcoinMarketCard /></ErrorBoundary>
    </div>
  )
}

/* Transactions */
function TransactionsTab({ txs }: { txs: Tx[] }) {
  const [filter, setFilter] = useState('')
  const { t, intl } = useI18n()
  // Filter on the client-facing label so the tabs match the rows they show.
  const filtered = filter ? txs.filter(x => txLabel(x, t) === filter) : txs
  const types = Array.from(new Set(txs.map(x => txLabel(x, t))))

  return (
    <div className="space-y-4">
      {types.length > 1 && (
        <div className="seg flex-wrap max-w-full" role="tablist">
          {['', ...types].map(ty => (
            <button
              key={ty || 'all'}
              onClick={() => setFilter(ty)}
              role="tab"
              aria-selected={filter === ty}
              className={`seg-btn ${filter === ty ? 'seg-btn-on' : ''}`}
            >
              {ty || t('common.all')}
            </button>
          ))}
        </div>
      )}

      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title={t('dash.noTx')} body={t('dash.noTxBodyFull')} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs text-fg-faint">
                    {(['dash.colType', 'dash.colAmount', 'dash.colFee', 'dash.colStatus', 'dash.colReference', 'dash.colDate'] as TKey[]).map(h => (
                      <th key={h} className={`px-5 py-3 font-medium ${h === 'dash.colAmount' || h === 'dash.colFee' ? 'text-right' : ''}`}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {filtered.map(tx => (
                    <tr key={tx.id} className="hover:bg-ink-850 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-fg">{txLabel(tx, t)}</span>
                        {tx.method && tx.type !== 'adjustment' && <p className="text-xs text-fg-faint">{tx.type === 'withdrawal' ? t(tx.method === 'profit_balance' ? 'withdraw.fromProfit' : 'withdraw.fromAvailable') : methodLabel(tx.method, t)}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-fg tabular-nums">${fmt(tx.amount)}</td>
                      <td className="px-5 py-3.5 text-right text-fg-muted tabular-nums">{tx.fee ? `$${fmt(tx.fee)}` : '-'}</td>
                      <td className="px-5 py-3.5"><StatusTag status={tx.status} /></td>
                      <td className="px-5 py-3.5 text-xs text-fg-muted font-mono">{tx.reference || '-'}</td>
                      <td className="px-5 py-3.5 text-fg-muted whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })}
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
                      <p className="text-sm text-fg">{txLabel(tx, t)}</p>
                      <p className="text-xs text-fg-faint">{new Date(tx.created_at).toLocaleString(intl, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
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
              {filtered.length === 1 ? t('dash.txCountOne') : t('dash.txCountMany', { n: filtered.length })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* Deposit */
function DepositTab({ onSuccess }: { onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bitcoin')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ reference: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [stage, setStage] = useState<'' | 'uploading' | 'submitting'>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  // One key per deposit attempt. A retry after a timeout reuses it, so the
  // server returns the original deposit instead of recording a second one.
  // It is replaced after a confirmed success or when the details change.
  const attemptKey = useRef(newRequestKey())
  const uploaded = useRef<{ file: File; path: string } | null>(null)
  const inFlight = useRef(false)
  useEffect(() => { attemptKey.current = newRequestKey() }, [amount, method, notes, file])

  const copyAddress = () => {
    navigator.clipboard.writeText(BTC_ADDRESS).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError(t('deposit.errAmount')); return }
    if (file && file.size > 5 * 1024 * 1024) { setError(t('deposit.errSize')); return }
    if (file && !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) { setError(t('deposit.errType')); return }
    if (inFlight.current) return
    inFlight.current = true

    setSubmitting(true)
    const key = attemptKey.current
    try {
      let receiptPath: string | undefined
      if (file) {
        // Reuse a receipt already uploaded for this attempt.
        if (uploaded.current?.file === file) {
          receiptPath = uploaded.current.path
        } else {
          setStage('uploading')
          const fd = new FormData()
          fd.append('file', file)
          fd.append('key', key)
          const up = await readJson<{ path: string }>(await authFetch('/api/client/upload-receipt', { method: 'POST', body: fd }, 60_000))
          uploaded.current = { file, path: up.path }
          receiptPath = up.path
        }
      }

      setStage('submitting')
      const data = await readJson<{ deposit?: { reference?: string } }>(await authFetch('/api/client/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ amount: amt, method, receipt_path: receiptPath, notes: notes.trim() || undefined }),
      }))

      setSuccess({ reference: data.deposit?.reference || '' })
      setAmount('')
      setNotes('')
      setFile(null)
      uploaded.current = null
      if (fileRef.current) fileRef.current.value = ''
      attemptKey.current = newRequestKey()
      onSuccess()
    } catch (err) {
      const offline = err instanceof RequestError && err.status === 0
      setError(offline
        ? `${errorText(err, t)} ${t('errors.noDuplicate')}`
        : errorText(err, t))
    } finally {
      inFlight.current = false
      setSubmitting(false)
      setStage('')
    }
  }

  if (success) {
    return (
      <div className="max-w-lg">
        <div className="panel p-6 sm:p-8">
          <span className="w-10 h-10 rounded-md border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-5"><IconCheck /></span>
          <h3 className="text-xl font-semibold text-fg mb-2">{t('deposit.submitted')}</h3>
          <p className="text-[15px] text-fg-muted mb-5">{t('deposit.submittedBody')}</p>
          {success.reference && (
            <div className="p-4 rounded-md bg-ink-850 border border-ink-700 mb-6">
              <p className="text-xs text-fg-faint mb-1">{t('deposit.reference')}</p>
              <p className="text-fg font-mono">{success.reference}</p>
            </div>
          )}
          <button onClick={() => setSuccess(null)} className="btn btn-outline">{t('deposit.another')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg">{t('deposit.step1')}</h3>
        <p className="text-[13px] text-fg-faint mt-1 mb-5">{t('deposit.step1Body')}</p>
        <div className="w-44 h-44 mx-auto sm:mx-0 mb-5 bg-white rounded-md p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=bitcoin:${BTC_ADDRESS}`} alt={t('deposit.qrAlt')} className="w-full h-full" />
        </div>
        <label className="field-label">{t('deposit.address')}</label>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-ink-950 border border-ink-600 font-mono text-[13px] text-fg break-all select-all">{BTC_ADDRESS}</div>
          <button onClick={copyAddress} className="btn btn-outline btn-sm !h-auto shrink-0" aria-label={t('deposit.copyAddress')}>
            {copied ? <><IconCheck width={15} height={15} />{t('common.copied')}</> : <><IconCopy width={15} height={15} />{t('common.copy')}</>}
          </button>
        </div>
        <div role="note" className="alert alert-warning mt-5 !text-[13px]">
          <IconAlert className="shrink-0 text-amber-400 mt-px" width={16} height={16} aria-hidden="true" />
          <span className="text-fg-muted">{t('deposit.warning')}</span>
        </div>
      </div>

      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg">{t('deposit.step2')}</h3>
        <p className="text-[13px] text-fg-faint mt-1 mb-5">{t('deposit.step2Body')}</p>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && <FormError message={error} />}

          <div>
            <label htmlFor="amount" className="field-label">{t('deposit.amount')}</label>
            <input id="amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required className="field tabular-nums" disabled={submitting} />
          </div>

          <div>
            <label htmlFor="method" className="field-label">{t('deposit.method')}</label>
            <select id="method" value={method} onChange={e => setMethod(e.target.value)} className="field" disabled={submitting}>
              <option value="bitcoin">{t('dash.method.bitcoin')}</option>
              <option value="bank_transfer">{t('dash.method.bank_transfer')}</option>
              <option value="wire_transfer">{t('dash.method.wire_transfer')}</option>
              <option value="other">{t('dash.method.other')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="receipt" className="field-label">{t('deposit.receipt')}</label>
            <input
              id="receipt" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-fg-muted file:mr-3 file:h-9 file:px-3 file:rounded-md file:border file:border-ink-600 file:bg-ink-850 file:text-fg file:text-[13px] file:font-medium file:cursor-pointer hover:file:bg-ink-800"
              disabled={submitting}
            />
            <p className="text-xs text-fg-faint mt-1.5">{t('deposit.receiptHelp')}</p>
          </div>

          <div>
            <label htmlFor="notes" className="field-label">{t('common.notes')}</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('deposit.notesPlaceholder')} rows={3} className="field resize-none" disabled={submitting} />
          </div>

          <button type="submit" disabled={submitting} className="btn btn-solid w-full">
            {submitting ? <><Spinner />{stage === 'uploading' ? t('deposit.uploading') : t('common.submitting')}</> : t('deposit.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}

/* Withdraw */
const OPEN_STATUSES = ['pending_review', 'pending', 'requested', 'under_review']
const SOURCES = [
  { id: 'available_balance', label: 'withdraw.availableBalance', short: 'withdraw.availableShort' },
  { id: 'profit_balance', label: 'withdraw.profitBalance', short: 'withdraw.profitShort' },
] as const
type Source = typeof SOURCES[number]['id']

function WithdrawTab({ account, txs, onSuccess }: { account: Account | null; txs: Tx[]; onSuccess: () => void }) {
  const [source, setSource] = useState<Source>('available_balance')
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const { t, intl } = useI18n()
  const attemptKey = useRef(newRequestKey())
  const inFlight = useRef(false)
  useEffect(() => { attemptKey.current = newRequestKey() }, [source, amount, address, notes])

  const withdrawals = txs.filter(t => t.type === 'withdrawal')
  const reserved = (src: Source) => withdrawals.filter(t => t.method === src && OPEN_STATUSES.includes(t.status)).reduce((s, t) => s + Number(t.amount), 0)
  const balanceOf = (src: Source) => Number((src === 'profit_balance' ? account?.profit_balance : account?.available_balance) ?? 0)
  const withdrawable = (src: Source) => Math.max(0, Math.round((balanceOf(src) - reserved(src)) * 100) / 100)
  const max = withdrawable(source)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!amt || amt <= 0) { setError(t('withdraw.errAmount')); return }
    if (amt > max) { setError(t('withdraw.errMax', { max: `$${fmt(max)}` })); return }
    if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/.test(address.trim())) { setError(t('withdraw.errAddress')); return }

    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    try {
      const data = await readJson<{ withdrawal?: { reference?: string } }>(await authFetch('/api/client/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attemptKey.current },
        body: JSON.stringify({ amount: amt, source, address: address.trim(), notes: notes.trim() || undefined }),
      }))
      setDone(data.withdrawal?.reference || '')
      setAmount('')
      setNotes('')
      attemptKey.current = newRequestKey()
      onSuccess()
    } catch (err) {
      const offline = err instanceof RequestError && err.status === 0
      setError(offline
        ? `${errorText(err, t)} ${t('errors.noDuplicate')}`
        : errorText(err, t))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
      <div className="space-y-4">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-4">{t('withdraw.canWithdraw')}</h3>
          <dl className="divide-y divide-ink-700">
            {SOURCES.map(s => (
              <div key={s.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-fg-muted">{t(s.label)}</dt>
                  <dd className="text-sm font-medium text-fg tabular-nums">${fmt(balanceOf(s.id))}</dd>
                </div>
                {reserved(s.id) > 0 && (
                  <p className="text-xs text-fg-faint mt-1">{t('withdraw.reserved', { reserved: `$${fmt(reserved(s.id))}`, left: `$${fmt(withdrawable(s.id))}` })}</p>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-fg-muted">{t('dash.accountBalance')}</dt>
              <dd className="text-sm text-fg-muted tabular-nums">${fmt(account?.account_balance ?? 0)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-2">{t('withdraw.how')}</h3>
          <ol className="space-y-2 text-sm text-fg-muted list-decimal pl-5">
            <li>{t('withdraw.how1')}</li>
            <li>{t('withdraw.how2')}</li>
            <li>{t('withdraw.how3')}</li>
            <li>{t('withdraw.how4')}</li>
          </ol>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg mb-2">{t('withdraw.help')}</h3>
          <p className="text-sm text-fg-muted mb-4">{t('withdraw.helpBody')}</p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account support')}`} className="btn btn-outline w-full sm:w-auto break-all">
            <IconMail width={17} height={17} />{SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      <div className="space-y-4 order-first lg:order-none">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-fg">{t('withdraw.title')}</h3>
          <p className="text-[13px] text-fg-faint mt-1 mb-5">{t('withdraw.body')}</p>

          {done !== null && (
            <div role="status" className="alert alert-success mb-5">
              <IconCheck className="shrink-0 mt-px" width={16} height={16} aria-hidden="true" />
              <span>{done ? t('withdraw.submittedRef', { ref: done }) : t('withdraw.submitted')}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && <FormError message={error} />}

            <fieldset>
              <legend className="field-label">{t('withdraw.from')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {SOURCES.map(s => (
                  <label key={s.id} className={`cursor-pointer min-w-0 rounded-md border px-3 py-2.5 transition-colors ${source === s.id ? 'border-accent bg-ink-850 shadow-[inset_0_0_0_1px_rgb(var(--accent)/.35)]' : 'border-ink-600 hover:border-ink-500'}`}>
                    <input type="radio" name="source" value={s.id} checked={source === s.id} onChange={() => { setSource(s.id); setError('') }} className="sr-only" />
                    <span className="flex items-center gap-1.5 text-sm text-fg">
                      {source === s.id && <IconCheck width={14} height={14} className="shrink-0 text-accent" aria-hidden="true" />}
                      {t(s.short)}
                    </span>
                    <span className="block text-xs text-fg-faint tabular-nums">{t('withdraw.availableAmount', { amount: `$${fmt(withdrawable(s.id))}` })}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <label htmlFor="w-amount" className="field-label !mb-0">{t('withdraw.amount')}</label>
                <button type="button" onClick={() => setAmount(max > 0 ? max.toFixed(2) : '')} className="text-[13px] text-fg-muted hover:text-fg disabled:opacity-40" disabled={max <= 0}>{t('withdraw.max')}</button>
              </div>
              <input id="w-amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="field tabular-nums" disabled={submitting} />
            </div>

            <div>
              <label htmlFor="w-address" className="field-label">{t('withdraw.yourAddress')}</label>
              <input id="w-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="bc1..." autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" disabled={submitting} />
              <p className="text-xs text-fg-faint mt-1.5">{t('withdraw.addressHelp')}</p>
            </div>

            <div>
              <label htmlFor="w-notes" className="field-label">{t('common.notes')}</label>
              <textarea id="w-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field resize-none" disabled={submitting} />
            </div>

            <button type="submit" disabled={submitting || max <= 0} className="btn btn-solid w-full">
              {submitting ? <><Spinner />{t('common.submitting')}</> : max <= 0 ? t('withdraw.nothing') : t('withdraw.submit')}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="px-5 h-14 flex items-center border-b border-ink-700">
            <h3 className="text-[15px] font-semibold text-fg">{t('withdraw.requests')}</h3>
          </div>
          {withdrawals.length === 0 ? (
            <EmptyState title={t('withdraw.noRequests')} />
          ) : (
            <ul className="divide-y divide-ink-700">
              {withdrawals.map(w => (
                <li key={w.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{t(w.method === 'profit_balance' ? 'withdraw.fromProfit' : 'withdraw.fromAvailable')}</p>
                    <p className="text-xs text-fg-faint">{new Date(w.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })}{w.reference ? ` · ${w.reference}` : ''}</p>
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
  const { t, intl } = useI18n()
  const rows: [TKey, string][] = [
    ['common.fullName', user?.full_name || t('common.notSet')],
    ['common.email', user?.email || t('common.notSet')],
    ['profile.emailConfirmed', user?.email_confirmed === undefined ? t('common.unknown') : user.email_confirmed ? t('common.yes') : t('common.no')],
    ['profile.memberSince', user?.created_at ? new Date(user.created_at).toLocaleDateString(intl, { month: 'long', day: 'numeric', year: 'numeric' }) : t('common.unknown')],
    ['dash.accountBalance', `$${fmt(account?.account_balance ?? 0)}`],
    ['withdraw.profitBalance', `$${fmt(account?.profit_balance ?? 0)}`],
  ]
  return (
    <div className="max-w-lg space-y-4">
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-4">{t('profile.details')}</h3>
        <dl className="divide-y divide-ink-700">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">{t(label)}</dt>
              <dd className="text-sm text-fg text-right truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-2">{t('common.password')}</h3>
        <p className="text-sm text-fg-muted mb-5">{t('profile.passwordBody')}</p>
        <Link href="/forgot-password" className="btn btn-outline">{t('profile.changePassword')}</Link>
      </div>
    </div>
  )
}

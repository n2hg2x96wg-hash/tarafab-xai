'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
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
import {
  EmptyState, OPEN_STATUSES, StatusTag, SUPPORT_EMAIL, TxIcon, fmt, methodLabel, txLabel,
  type Account, type Tx, type UserInfo,
} from '@/components/dashboard/shared'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useTheme } from '@/lib/theme/ThemeProvider'
import {
  IconAlert, IconArrowDown, IconArrowUp, IconChart, IconCheck, IconClose, IconCopy, IconGrid,
  IconInfo, IconList, IconLogOut, IconMail, IconMenu, IconUser, Logo,
  IconBell, IconHelp, IconHistory, IconPie, IconShield, IconSliders, IconSwap, IconTrend,
} from '@/components/Icons'
import {
  HistoryTab, LoadMore, NotificationsTab, PerformanceTab, PortfolioTab, PreferencesTab, SecurityTab, SupportTab, noticesFrom,
  type TeamNotice,
  txTotals,
} from '@/components/dashboard/ExtraTabs'
import { AnimatedPrice } from '@/components/MarketBits'
import { ReceiptField } from '@/components/dashboard/ReceiptField'
import { isAllowedUpload, MAX_UPLOAD_BYTES, prepareUpload } from '@/lib/uploadFile'
import { VerificationTab } from '@/components/dashboard/VerificationTab'
import { useToast } from '@/components/Toast'
import { ActiveInvestmentsCard, InvestmentCenter } from '@/components/dashboard/InvestmentCenter'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CommandSearch, type CommandItem } from '@/components/dashboard/CommandSearch'
import { MarketActivityTab, PriceHistoryTab } from '@/components/dashboard/MarketTabs'

const BTC_ADDRESS = 'bc1qvpwmdln4nm6xa2k9q26l84pg4ud0uuqzk83053'

function TradingViewChart({ height }: { height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const { locale } = useI18n()
  const { resolved } = useTheme()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: 'COINBASE:BTCUSD', interval: '60', timezone: 'Etc/UTC',
      theme: resolved, style: '1', locale, backgroundColor: resolved === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(13, 16, 22, 1)',
      gridColor: resolved === 'light' ? 'rgba(16, 21, 30, 0.06)' : 'rgba(255, 255, 255, 0.04)', hide_side_toolbar: true, allow_symbol_change: false,
      save_image: false, calendar: false,
    })
    el.appendChild(script)
    return () => { el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' }
  }, [locale, resolved])
  return (
    <div className="tradingview-widget-container" ref={ref} style={{ height }}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>
type NavItem = { icon: Icon; label: TKey; id: string }
// Grouped client navigation. Items marked `core` can never be hidden by the
// admin navigation setting (it only accepts optional ids server-side too).
const NAV_GROUPS: { label: TKey; items: (NavItem & { core?: boolean })[] }[] = [
  { label: 'nav2.groupOverview', items: [
    { icon: IconGrid, label: 'dash.nav.overview', id: 'overview', core: true },
  ] },
  { label: 'nav3.groupMarkets', items: [
    { icon: IconChart, label: 'dash.nav.markets', id: 'markets' },
    { icon: IconSwap, label: 'nav3.marketActivity', id: 'marketActivity' },
    { icon: IconHistory, label: 'nav3.priceHistory', id: 'priceHistory' },
  ] },
  { label: 'nav2.groupPortfolio', items: [
    { icon: IconPie, label: 'nav2.portfolio', id: 'portfolio' },
    { icon: IconList, label: 'dash.nav.transactions', id: 'transactions' },
    { icon: IconTrend, label: 'nav3.performance', id: 'performance' },
  ] },
  { label: 'nav3.groupFunds', items: [
    { icon: IconArrowDown, label: 'dash.nav.deposit', id: 'deposit' },
    { icon: IconArrowUp, label: 'dash.nav.withdraw', id: 'withdraw' },
    { icon: IconHistory, label: 'nav2.depositHistory', id: 'depositHistory' },
    { icon: IconHistory, label: 'nav2.withdrawalHistory', id: 'withdrawalHistory' },
  ] },
  { label: 'nav2.groupAccount', items: [
    { icon: IconUser, label: 'dash.nav.profile', id: 'profile', core: true },
    { icon: IconShield, label: 'nav2.security', id: 'security', core: true },
    { icon: IconCheck, label: 'kyc.nav', id: 'verification' },
    { icon: IconBell, label: 'nav2.notifications', id: 'notifications' },
    { icon: IconSliders, label: 'nav2.preferences', id: 'preferences', core: true },
  ] },
  { label: 'nav2.groupSupport', items: [
    { icon: IconHelp, label: 'nav2.support', id: 'support' },
  ] },
]
const navItems: NavItem[] = NAV_GROUPS.flatMap(g => g.items)
const NAV_IDS = new Set(navItems.map(n => n.id))

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U'
}

// Client-facing wording only — the transaction type in the database is
// unchanged. A credit to the profit balance reads as "Profit", any other
// credit as "Return", and a deduction keeps the neutral "Adjustment" so a
// balance being reduced is never presented as a gain.
export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [activeNav, setActiveNav] = useState('overview')
  // Investment to open once the Investment Center has loaded (from a notification or #investments/<id>).
  const [focusInv, setFocusInv] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  // Shortcut hint matches the keyboard: Cmd on Apple devices, Ctrl elsewhere.
  const [shortcut, setShortcut] = useState('Ctrl K')
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut('⌘K') }, [])
  // Desktop sidebar can be narrowed to icons; remembered on this device only.
  const [collapsed, setCollapsed] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [txError, setTxError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Optional sections an admin has hidden; empty (all shown) until loaded
  // and if the setting cannot be read.
  const [hiddenNav, setHiddenNav] = useState<string[]>([])
  const [navOrder, setNavOrder] = useState<string[]>([])
  const [navLabels, setNavLabels] = useState<Record<string, string>>({})
  const [teamNotices, setTeamNotices] = useState<TeamNotice[]>([])
  const [seenAt, setSeenAt] = useState<string | null>(null)
  const olderLoaded = useRef(false)
  const userId = useRef<string | null>(null)
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
      const [acc, tx, nav, notes] = await Promise.allSettled([
        authFetch('/api/client/account').then(r => readJson<{ user: UserInfo; account: Account }>(r)),
        authFetch('/api/client/transactions').then(r => readJson<{ transactions: Tx[]; hasMore?: boolean }>(r)),
        authFetch('/api/client/nav-config').then(r => readJson<{ config: { hidden?: string[]; order?: string[]; labels?: Record<string, string> } }>(r)),
        authFetch('/api/client/notifications').then(r => readJson<{ notifications: TeamNotice[] }>(r)),
      ])
      if (acc.status === 'fulfilled') {
        userId.current = acc.value.user.id
        setUser(acc.value.user); setAccount(acc.value.account); setLoadError('')
      } else setLoadError(errorText(acc.reason, tRef.current))
      if (tx.status === 'fulfilled') {
        const page = tx.value.transactions || []
        const last = page[page.length - 1]?.created_at
        // Keep older pages the client already loaded; refresh only the newest.
        setTxs(prev => olderLoaded.current && last ? [...page, ...prev.filter(x => x.created_at < last)] : page)
        if (!olderLoaded.current) setHasMore(Boolean(tx.value.hasMore))
        setTxError('')
      } else setTxError(errorText(tx.reason, tRef.current))
      if (nav.status === 'fulfilled' && Array.isArray(nav.value.config?.hidden)) {
        const c = nav.value.config
        setHiddenNav(c.hidden!)
        setNavOrder(Array.isArray(c.order) ? c.order.filter(x => typeof x === 'string') : [])
        const labels: Record<string, string> = {}
        if (c.labels && typeof c.labels === 'object') for (const [k, v] of Object.entries(c.labels)) if (typeof v === 'string' && v.trim()) labels[k] = v.trim().slice(0, 32)
        setNavLabels(labels)
      }
      if (notes.status === 'fulfilled' && Array.isArray(notes.value.notifications)) setTeamNotices(notes.value.notifications)
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { router.replace('/sign-in'); return }
      // A different account signed in (e.g. in another tab): never show the
      // previous account's figures under the new session. Reload cleanly.
      if (session?.user && userId.current && session.user.id !== userId.current) window.location.replace('/dashboard')
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

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('tarafab.sidebarCollapsed') === '1') } catch { /* storage unavailable */ }
    // Lets the stylesheet lift the support chat bubble above the phone
    // bottom bar while the dashboard is open.
    document.body.classList.add('has-bottom-nav')
    return () => document.body.classList.remove('has-bottom-nav')
  }, [])
  const toggleCollapsed = () => setCollapsed(c => {
    try { localStorage.setItem('tarafab.sidebarCollapsed', c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  // Open the section named in the URL (#deposit etc.) after a refresh.
  useEffect(() => {
    const raw = window.location.hash.slice(1)
    // #investments/<id> opens that investment inside the Investment Center. The
    // id only selects among the signed-in client's OWN investments (the API is
    // scoped by row level security), so another client's id shows nothing.
    const deep = /^investments\/([0-9a-f-]{36})$/i.exec(raw)
    if (deep) setFocusInv(deep[1])
    const id = deep || raw === 'investments' ? 'portfolio' : raw
    if (NAV_IDS.has(id)) setActiveNav(id)
  }, [])

  const loadMore = useCallback(async () => {
    const last = txs[txs.length - 1]?.created_at
    if (!last || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await readJson<{ transactions: Tx[]; hasMore?: boolean }>(await authFetch(`/api/client/transactions?before=${encodeURIComponent(last)}`))
      olderLoaded.current = true
      setTxs(prev => {
        const ids = new Set(prev.map(x => x.id))
        return [...prev, ...(d.transactions || []).filter(x => !ids.has(x.id))]
      })
      setHasMore(Boolean(d.hasMore))
      setTxError('')
    } catch (err) {
      setTxError(errorText(err, tRef.current))
    } finally {
      setLoadingMore(false)
    }
  }, [txs, loadingMore])

  // Notifications: "new" means newer than the last visit to that section,
  // remembered per account on this device (only a timestamp is stored).
  const notices = useMemo(() => noticesFrom(txs), [txs])
  useEffect(() => {
    if (!user?.id) return
    try { setSeenAt(localStorage.getItem(`tarafab.noticesSeen.${user.id}`)) } catch { /* ignore */ }
  }, [user?.id])
  useEffect(() => {
    if (activeNav !== 'notifications' || !user?.id) return
    const t0 = setTimeout(() => {
      const now = new Date().toISOString()
      try { localStorage.setItem(`tarafab.noticesSeen.${user.id}`, now) } catch { /* ignore */ }
    }, 1500)
    return () => clearTimeout(t0)
  }, [activeNav, user?.id])
  const unread = notices.filter(n => n.kind !== 'pending' && (!seenAt || n.at > seenAt)).length + teamNotices.filter(n => !n.read).length

  // Admin-set menu label, or the translated default.
  const labelOf = (item: { id: string; label: TKey }) => navLabels[item.id] || t(item.label)
  // Admin-set order within each group; unlisted items keep their default place.
  const rank = (id: string, fallback: number) => { const i = navOrder.indexOf(id); return i === -1 ? 1000 + fallback : i }

  const markTeamRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setTeamNotices(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
    try {
      await readJson(await authFetch('/api/client/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }))
    } catch { /* stays read locally; the next load shows the server state */ }
  }, [])

  // Mobile drawer: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [sidebarOpen])

  // A hidden section cannot stay open.
  useEffect(() => {
    if (hiddenNav.includes(activeNav)) setActiveNav('overview')
  }, [hiddenNav, activeNav])

  const [signingOut, setSigningOut] = useState(false)
  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    // supabase-js clears the session stored in this browser even when the
    // server half of sign-out fails, so leaving is safe offline. Catching here
    // only makes sure an unexpected throw can never strand the user on this
    // page with the button spinning.
    await supabase.auth.signOut().catch(e => console.error('sign-out failed:', e?.message || e))
    // Replace rather than push, so Back cannot return to this account's figures.
    router.replace('/')
  }

  // 'investments' is the public name of the Investment Center; it lives in the
  // Portfolio section. Kept as an alias so links and notification buttons can
  // target #investments without depending on the internal section id.
  const go = (rawId: string, investmentId?: string | null) => {
    const id = rawId === 'investments' ? 'portfolio' : rawId
    if (investmentId) setFocusInv(investmentId)
    setActiveNav(id); setSidebarOpen(false); window.scrollTo({ top: 0 })
    // Kept in the URL so a refresh or the back button returns to this section.
    try { window.history.replaceState(null, '', id === 'overview' ? '/dashboard' : `/dashboard#${id}`) } catch { /* ignore */ }
  }

  if (loading) return <DashboardSkeleton label={t('common.loading')} />

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

  // Same sections as the menu, including admin ordering and labels, minus
  // anything hidden, so search can never reach more than the menu can.
  const commandItems: CommandItem[] = NAV_GROUPS.flatMap(g => g.items
    .filter(i => i.core || !hiddenNav.includes(i.id))
    .map(i => ({ id: i.id, label: labelOf(i), group: t(g.label), icon: i.icon })))

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'there'
  const initials = initialsOf(displayName)
  const current = navItems.find(n => n.id === activeNav)

  return (
    <div className="site min-h-screen bg-ink-950 text-fg lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[min(18rem,85vw)] ${collapsed ? 'lg:w-[72px]' : 'lg:w-64'} h-[100dvh] safe-top bg-ink-900 border-r border-ink-700 flex flex-col transition-[transform,width] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${sidebarOpen ? 'translate-x-0 drawer-shadow' : '-translate-x-full'}`}>
        <div className={`h-16 flex items-center justify-between border-b border-ink-700 ${collapsed ? 'lg:px-0 lg:justify-center px-5' : 'px-5'}`}>
          <Link href="/" aria-label={t('common.home')} className={collapsed ? 'lg:hidden' : ''}><Logo /></Link>
          <button onClick={toggleCollapsed} className="hidden lg:flex w-9 h-9 rounded-md items-center justify-center text-fg-faint hover:text-fg hover:bg-ink-850" aria-label={collapsed ? t('shell.expand') : t('shell.collapse')} aria-expanded={!collapsed}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden -mr-2 w-10 h-10 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-ink-850" aria-label={t('common.closeMenu')}><IconClose /></button>
        </div>
        <nav className="flex-1 px-3 py-3 overflow-y-auto overscroll-contain" aria-label={t('dash.dashboard')}>
          {NAV_GROUPS.map(group => {
            const items = group.items.filter(i => i.core || !hiddenNav.includes(i.id)).map((it, i) => ({ it, r: rank(it.id, i) })).sort((a, b) => a.r - b.r).map(x => x.it)
            if (!items.length) return null
            return (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className={`px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint ${collapsed ? 'lg:sr-only' : ''}`}>{t(group.label)}</p>
                <div className="space-y-0.5">
                  {items.map(({ icon: I, label, id }) => (
                    <button
                      key={id}
                      onClick={() => go(id)}
                      title={collapsed ? labelOf({ id, label }) : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 min-h-11 lg:min-h-10 py-2 rounded-md text-sm transition-colors text-left ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                        activeNav === id ? 'nav-item-on font-medium' : 'nav-item'
                      }`}
                      aria-current={activeNav === id ? 'page' : undefined}
                    >
                      <I width={17} height={17} className={`shrink-0 ${activeNav === id ? 'text-brand-300' : ''}`} aria-hidden="true" />
                      <span className={`flex-1 min-w-0 ${collapsed ? 'lg:sr-only' : ''}`}>{labelOf({ id, label })}</span>
                      {id === 'notifications' && unread > 0 && (
                        <span className={`shrink-0 min-w-5 h-5 px-1.5 rounded-full ${collapsed ? 'lg:absolute lg:top-0.5 lg:right-2 lg:min-w-4 lg:h-4 lg:px-1 lg:text-[10px]' : ''} bg-brand-500/15 text-brand-300 text-[11px] font-semibold tabular-nums inline-flex items-center justify-center`}>
                          {unread}<span className="sr-only"> {t('notices.newCount', { n: unread })}</span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className={`p-3 border-t border-ink-700 safe-bottom ${collapsed ? 'lg:px-2' : ''}`}>
          <SystemStatus collapsed={collapsed} ok={!loadError} />
          <div className={`flex items-center gap-3 px-2 py-2 mb-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-xs font-semibold text-fg shrink-0">{initials}</span>
            <div className="min-w-0">
              <p className="text-sm text-fg truncate">{displayName}</p>
              <p className="text-xs text-fg-faint truncate">{user?.email}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-2 mb-2 ${collapsed ? 'lg:hidden' : ''}`}>
            <LanguageSelector align="left" direction="up" />
            <ThemeSelector align="left" direction="up" />
          </div>
          <button onClick={handleSignOut} disabled={signingOut} aria-busy={signingOut} className="w-full flex items-center gap-3 px-3 min-h-11 lg:min-h-10 rounded-md text-sm text-fg-muted hover:text-fg hover:bg-ink-850 transition-colors disabled:opacity-60">
            {signingOut ? <Spinner /> : <IconLogOut width={17} height={17} />}<span className={collapsed ? 'lg:sr-only' : ''}>{t('common.signOut')}</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] lg:hidden backdrop-in" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700/80 glass-bar">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden -ml-2 w-10 h-10 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-ink-850" aria-label={t('common.openMenu')} aria-expanded={sidebarOpen}><IconMenu width={22} height={22} /></button>
            <h1 className="text-[15px] font-semibold text-fg truncate">{current ? labelOf(current) : t('dash.dashboard')}</h1>
          </div>
          <button onClick={() => setCmdOpen(true)} className="hidden md:flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-ink-700 bg-ink-900/60 text-[13px] text-fg-faint hover:text-fg-muted hover:border-ink-600 transition-colors w-64 lg:w-72 mr-auto ml-6" aria-label={t('cmd.title')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="flex-1 text-left">{t('cmd.placeholder')}</span>
            <kbd className="text-[11px] border border-ink-600 rounded px-1.5 py-0.5 whitespace-nowrap">{shortcut}</kbd>
          </button>
          <div className="text-right shrink-0">
            <div className="text-[11px] text-fg-faint leading-none mb-1 whitespace-nowrap">{t('dash.accountBalance')}</div>
            {/* One client-facing balance: the account's spendable balance (available_balance), the same figure withdrawals and investments use. */}
            <div className="text-sm font-semibold text-fg tabular-nums leading-none">${fmt(account?.available_balance ?? 0)}</div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl chat-clearance">
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
          <ErrorBoundary key={activeNav} label={current ? labelOf(current) : undefined}>
            {activeNav === 'overview' && <OverviewTab name={displayName} account={account} txs={txs} go={go} can={id => !hiddenNav.includes(id)} labelOf={labelOf} />}
            {activeNav === 'markets' && <MarketsTab />}
            {activeNav === 'transactions' && <><TransactionsTab txs={txs} /><div className="mt-4"><LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} /></div></>}
            {activeNav === 'portfolio' && <div className="space-y-8"><InvestmentCenter go={go} focusId={focusInv} onFocusDone={() => setFocusInv(null)} /><PortfolioTab account={account} txs={txs} hasMore={hasMore} go={go} /></div>}
            {activeNav === 'depositHistory' && <HistoryTab kind="deposit" txs={txs} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={loadMore} go={go} />}
            {activeNav === 'withdrawalHistory' && <HistoryTab kind="withdrawal" txs={txs} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={loadMore} go={go} />}
            {activeNav === 'security' && <SecurityTab user={user} />}
            {activeNav === 'verification' && <VerificationTab />}
            {activeNav === 'preferences' && <PreferencesTab />}
            {activeNav === 'support' && <SupportTab />}
            {activeNav === 'notifications' && <NotificationsTab notices={notices} seenAt={seenAt} team={teamNotices} onRead={markTeamRead} go={go} />}
            {activeNav === 'performance' && <PerformanceTab txs={txs} hasMore={hasMore} />}
            {activeNav === 'marketActivity' && <MarketActivityTab />}
            {activeNav === 'priceHistory' && <PriceHistoryTab />}
            {activeNav === 'deposit' && <DepositTab onSuccess={fetchData} go={go} can={id => !hiddenNav.includes(id)} />}
            {activeNav === 'withdraw' && <WithdrawTab account={account} txs={txs} onSuccess={fetchData} />}
            {activeNav === 'profile' && <ProfileTab user={user} account={account} />}
          </ErrorBoundary>
        </main>
      </div>

      <CommandSearch items={commandItems} open={cmdOpen} onOpenChange={setCmdOpen} onGo={go} />
      <BottomNav active={activeNav} can={id => !hiddenNav.includes(id)} go={go} onMenu={() => setSidebarOpen(true)} unread={unread} t={t} />
    </div>
  )
}

/* Phone navigation: the four places people go most, plus the full menu.
   Hidden sections drop out; the bar is a phone layout, not a shrunken sidebar. */
function BottomNav({ active, can, go, onMenu, unread, t }: {
  active: string; can: (id: string) => boolean; go: (id: string) => void; onMenu: () => void; unread: number; t: (k: TKey) => string
}) {
  const items = ([
    ['overview', 'shell.home', IconGrid],
    ['markets', 'dash.nav.markets', IconChart],
    ['portfolio', 'nav2.portfolio', IconPie],
    ['transactions', 'shell.activity', IconList],
  ] as [string, TKey, Icon][]).filter(([id]) => id === 'overview' || can(id))
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-bar border-t border-ink-700/80" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={t('shell.quickNav')}>
      <ul className="flex">
        {items.map(([id, label, I]) => {
          const on = active === id
          return (
            <li key={id} className="flex-1">
              <button onClick={() => go(id)} aria-current={on ? 'page' : undefined}
                className={`w-full h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-[.97] ${on ? 'text-fg' : 'text-fg-faint'}`}>
                <span className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${on ? 'bg-accent/15 text-accent' : ''}`}><I width={19} height={19} aria-hidden="true" /></span>
                {t(label)}
              </button>
            </li>
          )
        })}
        <li className="flex-1">
          <button onClick={onMenu} className="relative w-full h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-fg-faint active:scale-[.97]" aria-label={t('common.openMenu')}>
            <span className="relative flex items-center justify-center w-10 h-7"><IconMenu width={19} height={19} aria-hidden="true" />
              {unread > 0 && <span className="absolute top-0.5 right-1.5 w-2 h-2 rounded-full bg-brand-400" aria-hidden="true" />}
            </span>
            {t('shell.more')}
          </button>
        </li>
      </ul>
    </nav>
  )
}

/* Reports only what the dashboard itself observed: whether its last request
   to the account service succeeded. There is no separate monitoring, so it
   never claims every service is operational. */
function SystemStatus({ collapsed, ok }: { collapsed: boolean; ok: boolean }) {
  const { t } = useI18n()
  return (
    <div className={`flex items-center gap-2.5 px-2 pb-2 text-xs ${collapsed ? 'lg:justify-center lg:px-0' : ''}`} title={t(ok ? 'shell.statusOkHint' : 'shell.statusIssueHint')}>
      <span className={`relative flex w-2 h-2 shrink-0`}>
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-success-400' : 'bg-warning-400'}`} />
      </span>
      <span className={`text-fg-faint ${collapsed ? 'lg:sr-only' : ''}`}>{t('shell.status')}: <span className="text-fg-muted">{t(ok ? 'shell.statusOk' : 'shell.statusIssue')}</span></span>
    </div>
  )
}

/* Loading skeleton: the same frame as the dashboard, so nothing shifts when
   the real figures replace it. Purely visual; it holds no data. */
function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="site min-h-screen bg-ink-950 lg:flex" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-ink-900 border-r border-ink-700" aria-hidden="true">
        <div className="h-16 px-5 flex items-center border-b border-ink-700"><div className="skeleton h-7 w-32" /></div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton h-9" style={{ opacity: 1 - i * .07 }} />)}
        </div>
      </aside>
      <div className="flex-1 min-w-0" aria-hidden="true">
        <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-ink-700">
          <div className="skeleton h-5 w-28" />
          <div className="skeleton h-8 w-24" />
        </div>
        <div className="p-4 sm:p-6 max-w-6xl space-y-5">
          <div className="skeleton h-8 w-64 max-w-full" />
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
            <div className="panel p-5 space-y-4">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-10 w-48" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>
            </div>
            <div className="panel p-5 space-y-4">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-9 w-40" />
              <div className="skeleton h-16" />
            </div>
          </div>
          <div className="panel p-5 space-y-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-10" />)}</div>
        </div>
      </div>
    </div>
  )
}

// Read from the visitor's own clock, after load, so it never mismatches the
// server render.
function greetingKey(): TKey {
  const h = new Date().getHours()
  return h < 5 ? 'overview.evening' : h < 12 ? 'overview.morning' : h < 18 ? 'overview.afternoon' : 'overview.evening'
}

/* The client's real KYC state from the server. Nothing is shown until it
   has been read, and "verified" appears only when the server says so. */
function KycChip({ go }: { go: (id: string) => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<{ status: string; has_submission?: boolean } | null>(null)
  useEffect(() => {
    let alive = true
    authFetch('/api/client/kyc').then(r => readJson<{ kyc: { status: string; has_submission?: boolean } }>(r))
      .then(d => { if (alive) setState(d.kyc) }).catch(() => { /* chip simply stays hidden */ })
    return () => { alive = false }
  }, [])
  if (!state) return null
  const status = state.has_submission === false ? 'unverified' : state.status
  const tone = status === 'verified' ? 'border-success-500/35 text-success-300 bg-success-500/[0.07]'
    : status === 'rejected' ? 'border-danger-400/40 text-danger-300 bg-danger-400/[0.07]'
    : status === 'unverified' ? 'border-accent/35 text-accent bg-accent/[0.07]'
    : 'border-warning-500/35 text-warning-300 bg-warning-500/[0.07]'
  const key: TKey = status === 'verified' ? 'kyc.status.verified' : status === 'rejected' ? 'kyc.step.attention'
    : status === 'under_review' ? 'kyc.status.underReview' : status === 'pending' ? 'kyc.status.pending' : 'overview.kycStart'
  return (
    <button onClick={() => go('verification')} className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-[13px] font-medium transition-colors hover:brightness-110 ${tone}`}>
      <IconShield width={15} height={15} aria-hidden="true" />{key === 'overview.kycStart' ? t(key) : `KYC · ${t(key)}`}
    </button>
  )
}

/* Overview */
function OverviewTab({ name, account, txs, go, can, labelOf }: { name: string; account: Account | null; txs: Tx[]; go: (id: string) => void; can: (id: string) => boolean; labelOf: (item: { id: string; label: TKey }) => string }) {
  const recentTxs = txs.slice(0, 5)
  const pendingCount = txs.filter(x => x.status.startsWith('pending')).length
  const { t, intl } = useI18n()
  const totals = txTotals(txs)
  const money = (n: number) => `$${fmt(n)}`
  const quick = ([
    ['deposit', 'dash.nav.deposit', IconArrowDown],
    ['withdraw', 'dash.nav.withdraw', IconArrowUp],
    ['transactions', 'dash.nav.transactions', IconList],
    ['markets', 'dash.nav.markets', IconChart],
  ] as [string, TKey, Icon][]).filter(([id]) => can(id))

  return (
    <div className="space-y-5 panel-in">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t(greetingKey(), { name })}</h2>
          <p className="text-sm text-fg-faint mt-0.5">{t('overview.subtitle')}</p>
        </div>
        {can('verification') && <KycChip go={go} />}
      </div>

      {pendingCount > 0 && (
        <div role="status" className="alert alert-warning">
          <IconInfo className="shrink-0 text-amber-400 mt-px" width={17} height={17} aria-hidden="true" />
          <p className="text-fg-muted">
            {pendingCount === 1 ? t('dash.pendingOne') : t('dash.pendingMany', { n: pendingCount })}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* Primary: balance, the other balances and quick actions */}
        <section className="relative overflow-hidden rounded-2xl border border-ink-700 p-5 sm:p-6 bg-[linear-gradient(135deg,rgb(var(--accent)/.10),rgb(var(--brand-500)/.05)_55%,transparent),rgb(var(--ink-900))] shadow-[inset_0_1px_0_rgb(var(--contrast)/.06),0_24px_48px_-28px_rgb(var(--shadow)/var(--shadow-strength))]" aria-labelledby="ov-bal">
          {/* Restrained accent light in the corner; decorative only. */}
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          <p id="ov-bal" className="relative text-[12px] font-medium uppercase tracking-[0.12em] text-fg-faint">{t('dash.accountBalance')}</p>
          <p className="relative mt-2 text-[36px] sm:text-[44px] leading-none font-semibold tracking-[-0.03em] text-fg tabular-nums">
            <AnimatedPrice value={Number(account?.available_balance ?? 0)} format={money} />
          </p>
          {/* Phones: one row per figure so full amounts are always readable
              (a six-figure profit does not fit in a third of the width);
              from sm up they sit side by side. */}
          <dl className="relative mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ['dash.profit', account?.profit_balance ?? 0],
              ['dash.invested', account?.invested_balance ?? 0],
              ['dash.pending', account?.pending_balance ?? 0],
            ] as [TKey, number][]).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-ink-950/55 border border-ink-700/70 px-3 py-2.5 min-w-0 backdrop-blur-sm flex items-center justify-between gap-3 sm:block">
                <dt className="text-[12px] sm:text-[11px] text-fg-faint truncate">{t(label)}</dt>
                <dd className="text-[15px] font-semibold text-fg tabular-nums sm:mt-0.5 sm:truncate text-right sm:text-left">{money(Number(value))}</dd>
              </div>
            ))}
          </dl>
          {quick.length > 0 && (
            <div className="relative mt-5">
              <p className="sr-only">{t('overview.quickActions')}</p>
              {/* Four actions sit in a 2x2 grid on phones so each label has room
                  and each target stays large; one row from tablet width up. */}
              <div className={`grid gap-2 ${quick.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : quick.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {quick.map(([id, label, I], i) => (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className={`group flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl border px-2 text-[12.5px] font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[.97] ${i === 0 ? 'border-accent/40 bg-accent/10 text-fg hover:bg-accent/15' : 'border-ink-700 bg-ink-900/60 text-fg-muted hover:text-fg hover:border-ink-500'}`}
                  >
                    <I width={18} height={18} aria-hidden="true" className={i === 0 ? 'text-accent' : ''} />
                    <span className="text-center leading-tight">{labelOf({ id, label })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Secondary: market */}
        {can('markets') ? (
          <ErrorBoundary label={t('market.bitcoinMarket')}><BitcoinMarketCard /></ErrorBoundary>
        ) : (
          <div className="hidden lg:block" />
        )}
      </div>

      {can('portfolio') && <ErrorBoundary label={t('inv.f.activeTitle')}><ActiveInvestmentsCard go={go} /></ErrorBoundary>}

      <TradingStatusCard
        status={account?.trading_status}
        strategyName={account?.trading_strategy_name}
        updatedAt={account?.trading_status_updated_at}
      />

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-4">
        <section className="panel p-5 sm:p-6" aria-labelledby="ov-perf">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 id="ov-perf" className="text-[15px] font-semibold text-fg">{t('overview.performance')}</h3>
            {can('performance') && <button onClick={() => go('performance')} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1">{t('common.viewAll')}</button>}
          </div>
          <dl className="divide-y divide-ink-700">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">{t('overview.creditedReturns')}</dt>
              <dd className={`text-sm font-semibold tabular-nums ${totals.returns > 0 ? 'price-up' : 'text-fg'}`}>{money(totals.returns)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">{t('overview.netDeposits')}</dt>
              <dd className="text-sm font-semibold text-fg tabular-nums">{money(totals.deposited - totals.withdrawn)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="ov-recent">
          <div className="flex items-center justify-between px-5 h-14 border-b border-ink-700">
            <h3 id="ov-recent" className="text-[15px] font-semibold text-fg">{t('dash.recentTx')}</h3>
            {txs.length > 0 && can('transactions') && <button onClick={() => go('transactions')} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1">{t('common.viewAll')}</button>}
          </div>
          {recentTxs.length === 0 ? (
            <EmptyState title={t('dash.noTx')} body={t('dash.noTxBody')} />
          ) : (
            <ul className="divide-y divide-ink-700">
              {recentTxs.map(tx => (
                <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-850/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <TxIcon type={tx.type} />
                    <div className="min-w-0">
                      <p className="text-sm text-fg truncate">{txLabel(tx, t)}</p>
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
        </section>
      </div>

      {can('markets') && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC/USD</span>
            <span className="text-fg-faint">{t('landing.livePrice')}</span>
          </div>
          <ErrorBoundary label={t('dash.theChart')}><TradingViewChart height={360} /></ErrorBoundary>
        </div>
      )}

      <TrustBar />
    </div>
  )
}

/* Markets */
function MarketsTab() {
  const { t } = useI18n()
  return (
    <div className="space-y-4 panel-in">
      <div className="grid xl:grid-cols-[1.7fr_1fr] gap-4 items-start">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC/USD</span>
            <span className="text-fg-faint">{t('landing.livePrice')}</span>
          </div>
          <ErrorBoundary label={t('dash.theChart')}><TradingViewChart height={480} /></ErrorBoundary>
        </div>
        <ErrorBoundary label={t('market.bitcoinMarket')}><BitcoinMarketCard /></ErrorBoundary>
      </div>
    </div>
  )
}

/* Transactions */
// Status groups for the filter, so "Pending" also covers pending_review etc.
const STATUS_GROUPS: Record<string, string[]> = {
  pending: OPEN_STATUSES,
  completed: ['completed', 'approved'],
  rejected: ['rejected', 'failed'],
}

function TransactionsTab({ txs }: { txs: Tx[] }) {
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { t, intl } = useI18n()
  const types = Array.from(new Set(txs.map(x => txLabel(x, t))))
  // Everything filters the records already loaded; nothing is re-fetched.
  const q = query.trim().toLowerCase()
  const filtered = txs.filter(x => {
    // Filter on the client-facing label so the tabs match the rows they show.
    if (filter && txLabel(x, t) !== filter) return false
    if (status && !STATUS_GROUPS[status]?.includes(x.status)) return false
    const day = x.created_at.slice(0, 10)
    if (from && day < from) return false
    if (to && day > to) return false
    if (q && ![x.reference, txLabel(x, t), fmt(x.amount), String(x.amount)].some(v => (v || '').toLowerCase().includes(q))) return false
    return true
  })
  const narrowed = Boolean(q || status || from || to)

  return (
    <div className="space-y-4">
      <div className="panel p-3 sm:p-4 grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="tx-search">{t('txc.search')}</label>
        <input id="tx-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('txc.search')} className="field" />
        <label className="sr-only" htmlFor="tx-status">{t('dash.colStatus')}</label>
        <select id="tx-status" value={status} onChange={e => setStatus(e.target.value)} className="field sm:w-44">
          <option value="">{t('txc.anyStatus')}</option>
          <option value="pending">{t('status.pending')}</option>
          <option value="completed">{t('status.completed')}</option>
          <option value="rejected">{t('status.rejected')}</option>
        </select>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-2">
          <label className="min-w-0"><span className="sr-only">{t('txc.from')}</span>
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="field" aria-label={t('txc.from')} /></label>
          <label className="min-w-0"><span className="sr-only">{t('txc.to')}</span>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="field" aria-label={t('txc.to')} /></label>
        </div>
      </div>
      {narrowed && (
        <div className="flex items-center justify-between gap-3 text-[13px] text-fg-muted">
          <span>{filtered.length === 1 ? t('dash.txCountOne') : t('dash.txCountMany', { n: filtered.length })}</span>
          <button onClick={() => { setQuery(''); setStatus(''); setFrom(''); setTo('') }} className="btn btn-sm btn-ghost">{t('txc.clear')}</button>
        </div>
      )}
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
          txs.length > 0
            ? <EmptyState title={t('txc.noMatch')} body={t('txc.noMatchBody')} />
            : <EmptyState title={t('dash.noTx')} body={t('dash.noTxBodyFull')} />
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
function DepositTab({ onSuccess, go, can }: { onSuccess: () => void; go: (id: string) => void; can: (id: string) => boolean }) {
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
  const toast = useToast()
  // One key per deposit attempt. A retry after a timeout reuses it, so the
  // server returns the original deposit instead of recording a second one.
  // It is replaced after a confirmed success or when the details change.
  const attemptKey = useRef(newRequestKey())
  const uploaded = useRef<{ file: File; path: string } | null>(null)
  const inFlight = useRef(false)
  useEffect(() => { attemptKey.current = newRequestKey() }, [amount, method, notes, file])

  const copyAddress = () => {
    navigator.clipboard.writeText(BTC_ADDRESS).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
      toast.show(t('common.copied'))
    }).catch(() => {})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError(t('deposit.errAmount')); return }
    if (file && !isAllowedUpload(file)) { setError(t('deposit.errType')); return }
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
          // Large phone photos are shrunk first so the request stays inside
          // the size a serverless function can receive.
          const ready = await prepareUpload(file)
          if (ready.size > MAX_UPLOAD_BYTES) { setError(t('deposit.errSize')); return }
          const fd = new FormData()
          fd.append('file', ready)
          fd.append('key', key)
          let up: { path: string }
          try {
            up = await readJson<{ path: string }>(await authFetch('/api/client/upload-receipt', { method: 'POST', body: fd }, 60_000))
          } catch (uploadErr) {
            // Say that the receipt is what failed, rather than blaming the
            // whole submission on the connection.
            throw uploadErr instanceof RequestError && uploadErr.status === 0
              ? new RequestError(t('deposit.errUpload'), 0)
              : uploadErr
          }
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
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => setSuccess(null)} className="btn btn-outline">{t('deposit.another')}</button>
            {can('transactions') && <button onClick={() => go('transactions')} className="btn btn-ghost">{t('deposit.viewTransactions')}</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg">{t('deposit.step1')}</h3>
        <p className="text-[13px] text-fg-faint mt-1 mb-5">{t('deposit.step1Body')}</p>
        <div className="w-44 h-44 mx-auto sm:mx-0 mb-5 bg-[#fff] rounded-md p-2">
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
            <ReceiptField file={file} onChange={setFile} disabled={submitting} />
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
  const toast = useToast()
  const attemptKey = useRef(newRequestKey())
  const inFlight = useRef(false)
  useEffect(() => { attemptKey.current = newRequestKey() }, [source, amount, address, notes])

  const withdrawals = txs.filter(t => t.type === 'withdrawal')
  const reserved = (src: Source) => withdrawals.filter(t => t.method === src && OPEN_STATUSES.includes(t.status)).reduce((s, t) => s + Number(t.amount), 0)
  const balanceOf = (src: Source) => Number((src === 'profit_balance' ? account?.profit_balance : account?.available_balance) ?? 0)
  const withdrawable = (src: Source) => Math.max(0, Math.round((balanceOf(src) - reserved(src)) * 100) / 100)
  const max = withdrawable(source)

  // Submitting validates and opens a review of exactly what will be sent;
  // only Confirm in that review makes the request.
  const [review, setReview] = useState<{ amt: number } | null>(null)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!amt || amt <= 0) { setError(t('withdraw.errAmount')); return }
    if (amt > max) { setError(t('withdraw.errMax', { max: `$${fmt(max)}` })); return }
    if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/.test(address.trim())) { setError(t('withdraw.errAddress')); return }
    setReview({ amt })
  }

  const send = async () => {
    if (!review) return
    const amt = review.amt
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    try {
      const data = await readJson<{ withdrawal?: { reference?: string } }>(await authFetch('/api/client/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attemptKey.current },
        body: JSON.stringify({ amount: amt, source, address: address.trim(), notes: notes.trim() || undefined }),
      }))
      setReview(null)
      setDone(data.withdrawal?.reference || '')
      toast.show(t('withdraw.submitted'))
      setAmount('')
      setNotes('')
      attemptKey.current = newRequestKey()
      onSuccess()
    } catch (err) {
      const offline = err instanceof RequestError && err.status === 0
      // Close the review so the error is visible next to the form; the same
      // attempt key is kept, so retrying cannot create a second request.
      setReview(null)
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
      {review && (
        <ConfirmModal
          title={t('withdraw.reviewTitle')}
          confirmLabel={submitting ? t('common.submitting') : t('withdraw.confirm')}
          cancelLabel={t('withdraw.edit')}
          busy={submitting}
          onConfirm={send}
          onCancel={() => setReview(null)}
        >
          <dl className="divide-y divide-ink-700 text-sm">
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('withdraw.amount')}</dt><dd className="text-fg font-semibold tabular-nums">${fmt(review.amt)}</dd></div>
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('withdraw.from')}</dt><dd className="text-fg">{t(source === 'profit_balance' ? 'withdraw.profitShort' : 'withdraw.availableShort')}</dd></div>
            <div className="py-2.5"><dt className="text-fg-muted mb-1">{t('withdraw.yourAddress')}</dt><dd className="text-fg font-mono text-[13px] break-all">{address.trim()}</dd></div>
          </dl>
          <p className="mt-4 text-[13px] text-fg-muted leading-relaxed">{t('withdraw.reviewNote')}</p>
        </ConfirmModal>
      )}
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
              {submitting ? <><Spinner />{t('common.submitting')}</> : max <= 0 ? t('withdraw.nothing') : t('withdraw.review')}
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
    ['dash.accountBalance', `$${fmt(account?.available_balance ?? 0)}`],
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

'use client'

import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType, SVGProps, KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { BitcoinMarketCard } from '@/components/BitcoinMarket'
import { FormError, Spinner } from '@/components/AuthShell'
import { TrustBar } from '@/components/LandingExtras'
import { TradingStatusCard } from '@/components/TradingStatus'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { authFetch, errorText, newRequestKey, readJson, RequestError, SESSION_EXPIRED } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import {
  EmptyState, OPEN_STATUSES, StatusTag, SUPPORT_EMAIL, TxIcon, fmt, methodLabel, txLabel,
  type Account, type Tx, type UserInfo, PageIntro, SettingsRow, SettingsSection, signedAmount,
} from '@/components/dashboard/shared'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useTheme } from '@/lib/theme/ThemeProvider'
import {
  IconAlert, IconArrowDown, IconArrowUp, IconChart, IconCheck, IconClose, IconCopy, IconGrid,
  IconInfo, IconList, IconLogOut, IconMail, IconMenu, IconUser, Logo,
  IconBell, IconHelp, IconHistory, IconLock, IconPie, IconShield, IconSliders, IconSwap, IconTrend, IconWallet,
} from '@/components/Icons'
import { WalletTab } from '@/components/dashboard/WalletTab'
import { AssetCenter } from '@/components/markets/AssetCenter'
import { AutomationCenter } from '@/components/markets/AutomationCenter'
import { FeeRows, PremiumCenter, PremiumGateHost, useServiceFee, usePt } from '@/components/premium/Premium'
import { featuresLoaded, hiddenState, useFeatures } from '@/components/ui/features'
import { useEngineStatus } from '@/lib/engineStatus'
import type { FeatureKey } from '@/lib/features'
import { StateView } from '@/components/ui/State'
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
import { Rise, useScrollDepth } from '@/components/dashboard/Motion'
import { feedStatus } from '@/lib/marketStatus'
import { useAssets } from '@/components/markets/assetStore'
import { effectiveState } from '@/lib/marketStatus'
import { isAccountCredit, txCategory, txSign, type TxCategory } from '@/lib/txCategory'

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
// Command Center layout: every existing section, grouped by what the client
// is doing. Ids are unchanged, so links, admin ordering/labels/hiding and
// feature flags keep working exactly as before.
const NAV_GROUPS: { label: TKey; items: (NavItem & { core?: boolean })[] }[] = [
  { label: 'nav4.groupMain', items: [
    { icon: IconGrid, label: 'dash.nav.overview', id: 'overview', core: true },
    { icon: IconChart, label: 'dash.nav.markets', id: 'markets' },
    { icon: IconPie, label: 'nav2.portfolio', id: 'portfolio' },
    { icon: IconTrend, label: 'nav3.performance', id: 'performance' },
    { icon: IconSliders, label: 'automations.nav', id: 'automations' },
  ] },
  { label: 'nav3.groupFunds', items: [
    { icon: IconArrowDown, label: 'dash.nav.deposit', id: 'deposit' },
    { icon: IconArrowUp, label: 'dash.nav.withdraw', id: 'withdraw' },
    { icon: IconWallet, label: 'wallet.nav', id: 'wallet' },
    { icon: IconList, label: 'dash.nav.transactions', id: 'transactions' },
    { icon: IconHistory, label: 'nav2.depositHistory', id: 'depositHistory' },
    { icon: IconHistory, label: 'nav2.withdrawalHistory', id: 'withdrawalHistory' },
  ] },
  { label: 'nav4.groupTools', items: [
    { icon: IconHistory, label: 'nav3.priceHistory', id: 'priceHistory' },
    { icon: IconSwap, label: 'nav3.marketActivity', id: 'marketActivity' },
    { icon: IconLock, label: 'premium.nav', id: 'premium' },
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
  const [savedHiddenNav, setHiddenNav] = useState<string[]>([])
  // Sections switched off by the server-side feature states join the admin's
  // hidden sections; "coming soon" stays visible but shows no unfinished UI.
  const feature = useFeatures()
  const pt = usePt()
  const NAV_FEATURE = { automations: 'automations', premium: 'premium' } as const
  // Admin → Feature controls: each client module and the sections it covers.
  const MODULE_SECTIONS: Partial<Record<FeatureKey, string[]>> = {
    markets: ['markets', 'marketActivity', 'priceHistory'], portfolio: ['portfolio', 'performance'], wallet: ['wallet'],
    deposits: ['deposit', 'depositHistory'], withdrawals: ['withdraw', 'withdrawalHistory'], activity: ['transactions'],
    verification: ['verification'], announcements: ['notifications'], support: ['support'],
  }
  const hiddenNav = useMemo(() => [...savedHiddenNav, ...Object.entries(NAV_FEATURE).filter(([, k]) => hiddenState(feature(k))).map(([id]) => id),
    ...Object.entries(MODULE_SECTIONS).filter(([k]) => hiddenState(feature(k as FeatureKey))).flatMap(([, ids]) => ids!)],
    [savedHiddenNav, feature]) // eslint-disable-line react-hooks/exhaustive-deps
  const soon = (id: string) => id in NAV_FEATURE && feature(NAV_FEATURE[id as keyof typeof NAV_FEATURE]) === 'coming_soon'
  const [navOrder, setNavOrder] = useState<string[]>([])
  const [autoAsset, setAutoAsset] = useState<string | null>(null)
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
        authFetch('/api/client/account').then(r => readJson<{ user: UserInfo; account: Account; investments?: Account['investments'] }>(r)),
        authFetch('/api/client/transactions').then(r => readJson<{ transactions: Tx[]; hasMore?: boolean }>(r)),
        authFetch('/api/client/nav-config').then(r => readJson<{ config: { hidden?: string[]; order?: string[]; labels?: Record<string, string> } }>(r)),
        authFetch('/api/client/notifications').then(r => readJson<{ notifications: TeamNotice[] }>(r)),
      ])
      if (acc.status === 'fulfilled') {
        userId.current = acc.value.user.id
        // A client signed in on this device, so it is not (only) a staff device.
        if (acc.value.user.role !== 'admin') { try { localStorage.removeItem('tarafab.staffDevice') } catch { /* storage blocked */ } }
        setUser(acc.value.user); setAccount({ ...acc.value.account, investments: acc.value.investments ?? null }); setLoadError('')
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
      if (expired) window.dispatchEvent(new Event(SESSION_EXPIRED))
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
    // Keep a private deep link (e.g. #automations) through sign-in.
    if (!data.session) { const h = window.location.hash.slice(1); router.replace(/^[a-zA-Z]{2,32}$/.test(h) ? `/sign-in?next=${encodeURIComponent(h)}` : '/sign-in'); return }
    await fetchData()
    setLoading(false)
  }, [supabase, router, fetchData])

  useEffect(() => { init() }, [init])

  // Session could not be renewed (refresh token expired or revoked): hide the
  // account's figures at once, drop the dead session from this browser only
  // (local scope, no network), and go to sign-in keeping the current section
  // so the user lands back where they were. Runs once per page.
  const expiredOnce = useRef(false)
  useEffect(() => {
    const onExpired = () => {
      if (expiredOnce.current) return
      expiredOnce.current = true
      setAccount(null); setTxs([]); setTeamNotices([])
      const h = window.location.hash.slice(1)
      router.replace(`/sign-in?expired=1${/^[a-zA-Z]{2,32}$/.test(h) ? `&next=${encodeURIComponent(h)}` : ''}`)
      supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    window.addEventListener(SESSION_EXPIRED, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired)
  }, [supabase, router])

  // One listener per mounted dashboard, removed on unmount. Signing out in
  // another tab signs this tab out too.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { if (!expiredOnce.current) router.replace('/sign-in'); return }
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
    const timer = window.setInterval(maybeRefresh, 30_000)
    return () => {
      window.clearInterval(timer)
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
    const apply = () => {
      const raw = window.location.hash.slice(1)
      // #investments/<id> opens that investment inside the Investment Center. The
      // id only selects among the signed-in client's OWN investments (the API is
      // scoped by row level security), so another client's id shows nothing.
      const deep = /^investments\/([0-9a-f-]{36})$/i.exec(raw)
      if (deep) setFocusInv(deep[1])
      const id = deep || raw === 'investments' ? 'portfolio' : raw
      if (NAV_IDS.has(id)) setActiveNav(id)
    }
    apply()
    // Links to #section (e.g. #investments) also work while the dashboard is open.
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
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

  // Mobile drawer: opening it adds a history entry, so the phone's Back
  // button closes the drawer instead of leaving the page. Closing it any
  // other way (X, backdrop, Escape) pops that entry again.
  const closeDrawer = useCallback(() => {
    try { if ((window.history.state as { ccDrawer?: boolean } | null)?.ccDrawer) { window.history.back(); return } } catch { /* fall through */ }
    setSidebarOpen(false)
  }, [])
  useEffect(() => {
    if (!sidebarOpen) return
    try { if (!(window.history.state as { ccDrawer?: boolean } | null)?.ccDrawer) window.history.pushState({ ...(window.history.state || {}), ccDrawer: true }, '') } catch { /* ignore */ }
    const onPop = () => setSidebarOpen(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [sidebarOpen])

  // Mobile drawer: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [sidebarOpen, closeDrawer])

  // A hidden section cannot stay open (decided once the server's feature
  // states have arrived, so a link to an enabled section is not bounced;
  // until then the section itself does not render).
  useEffect(() => {
    if (featuresLoaded() && hiddenNav.includes(activeNav)) setActiveNav('overview')
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

  // What's New: the newest unread release notice from the team notification
  // system. Dismissing marks it read (server-side), so it never pops up twice;
  // it stays listed under Notifications.
  const whatsNewNotice = !hiddenNav.includes('notifications') ? teamNotices.find(x => x.type === 'release' && !x.read) : undefined
  const whatsNewNode = whatsNewNotice ? <WhatsNew key={whatsNewNotice.id} n={whatsNewNotice} onDismiss={() => markTeamRead([whatsNewNotice.id])}
    onOpen={() => { markTeamRead([whatsNewNotice.id]); const target = whatsNewNotice.cta_target?.slice(1); go(target && NAV_IDS.has(target) ? target : 'notifications') }} /> : null

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
    <div className="site cc-app min-h-screen bg-ink-950 text-fg lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[min(18rem,85vw)] ${collapsed ? 'lg:w-[72px]' : 'lg:w-64'} h-[100dvh] safe-top cc-drawer flex flex-col transition-[transform,width] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${sidebarOpen ? 'translate-x-0 drawer-shadow' : '-translate-x-full'}`}>
        <div className={`h-16 shrink-0 flex items-center justify-between border-b cc-sep ${collapsed ? 'lg:px-0 lg:justify-center px-5' : 'px-5'}`}>
          <Link href="/" aria-label={t('common.home')} className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <Logo />
            <span className="block pl-9 -mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] whitespace-nowrap text-accent/80">{t('nav4.tagline')}</span>
          </Link>
          <button onClick={toggleCollapsed} className="hidden lg:flex w-9 h-9 rounded-md items-center justify-center text-fg-faint hover:text-fg hover:bg-ink-850" aria-label={collapsed ? t('shell.expand') : t('shell.collapse')} aria-expanded={!collapsed}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          </button>
          <button onClick={closeDrawer} className="cc-close lg:hidden -mr-1 w-10 h-10 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-ink-850" aria-label={t('common.closeMenu')}><IconClose /></button>
        </div>
        {/* Scrolls on its own; min-h-0 lets it shrink so the footer below
            never covers the last groups on short phones. */}
        <nav className="flex-1 min-h-0 px-3 pt-3 overflow-y-auto overscroll-contain" aria-label={t('dash.dashboard')}>
          {NAV_GROUPS.map(group => {
            const items = group.items.filter(i => i.core || !hiddenNav.includes(i.id)).map((it, i) => ({ it, r: rank(it.id, i) })).sort((a, b) => a.r - b.r).map(x => x.it)
            if (!items.length) return null
            return (
              <div key={group.label} className="mb-2.5 last:mb-0 cc-navgroup">
                <p className={`px-3 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-faint/80 ${collapsed ? 'lg:sr-only' : ''}`}>{t(group.label)}</p>
                <div className="space-y-0.5">
                  {items.map(({ icon: I, label, id }) => (
                    <button
                      key={id}
                      onClick={() => go(id)}
                      title={collapsed ? labelOf({ id, label }) : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 min-h-11 lg:min-h-10 py-2 rounded-lg text-[14px] transition-colors text-left ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                        activeNav === id ? 'nav-item-on font-medium' : 'nav-item'
                      }`}
                      aria-current={activeNav === id ? 'page' : undefined}
                      data-nav-id={id}
                    >
                      <I width={17} height={17} className="shrink-0 transition-colors" aria-hidden="true" />
                      <span className={`flex-1 min-w-0 truncate ${collapsed ? 'lg:sr-only' : ''}`}>{labelOf({ id, label })}</span>
                      {id === 'automations' && <AutomationBadge collapsed={collapsed} />}
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
          {/* Soft fade so a list that continues below reads as scrollable. */}
          <div className="sticky bottom-0 h-6 -mx-3 bg-gradient-to-t from-ink-950/90 to-transparent pointer-events-none" aria-hidden="true" />
        </nav>
        {/* Fixed account footer (glass): automation status, the signed-in
            account, then language / theme and sign out. Compact so the
            navigation above keeps its room on short phones. */}
        <div className={`shrink-0 px-3 pt-3 pb-3 border-t cc-sep safe-bottom space-y-2.5 ${collapsed ? 'lg:px-2' : ''}`}>
          <div className={`flex items-center gap-2.5 px-1 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`} data-account-card>
            <span className="relative w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[13px] font-semibold text-accent shrink-0" title={collapsed ? displayName : undefined}>
              {initials}
              {/* Connection to the account service, as a dot on the avatar (detail in the tooltip). */}
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[rgb(var(--ink-950))] ${!loadError ? 'bg-success-400' : 'bg-warning-400'}`} data-connection={!loadError ? 'ok' : 'issue'} title={t(!loadError ? 'shell.statusOkHint' : 'shell.statusIssueHint')} aria-hidden="true" />
            </span>
            <div className={`min-w-0 flex-1 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-[13.5px] font-medium text-fg truncate">{displayName}</p>
              <p className="text-[11.5px] text-fg-faint truncate">{user?.email}</p>
              <span className="sr-only">{t('shell.status')}: {t(!loadError ? 'shell.statusOk' : 'shell.statusIssue')}</span>
            </div>
            <button onClick={handleSignOut} disabled={signingOut} aria-busy={signingOut} aria-label={t('common.signOut')} title={t('common.signOut')}
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-fg-faint hover:text-red-300 hover:bg-red-500/[.08] active:scale-[.96] transition disabled:opacity-60 ${collapsed ? 'lg:hidden' : ''}`} data-signout>
              {signingOut ? <Spinner /> : <IconLogOut width={17} height={17} aria-hidden="true" />}
            </button>
          </div>
          <div className={`cc-ctl flex items-center gap-2 ${collapsed ? 'lg:hidden' : ''}`}>
            <LanguageSelector align="left" direction="up" />
            <ThemeSelector align="left" direction="up" />
          </div>
          {/* Collapsed desktop rail: sign out stays reachable as an icon. */}
          {collapsed && (
            <button onClick={handleSignOut} disabled={signingOut} aria-label={t('common.signOut')} className="hidden lg:flex w-full justify-center min-h-10 items-center rounded-md text-fg-muted hover:text-fg hover:bg-ink-850">
              {signingOut ? <Spinner /> : <IconLogOut width={17} height={17} />}
            </button>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[4px] lg:hidden backdrop-in" onClick={closeDrawer} aria-hidden="true" />}

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
          <PremiumGateHost onSeePremium={() => go('premium')} />
          {/* Pages without their own title get the shared intro (menu label + one line). */}
          {current && INTRO_SUB[activeNav] !== undefined && <PageIntro title={labelOf(current)} sub={INTRO_SUB[activeNav] ? t(INTRO_SUB[activeNav] as TKey) : undefined} />}
          <ErrorBoundary key={activeNav} label={current ? labelOf(current) : undefined}>
            {activeNav === 'overview' && <OverviewTab whatsNew={whatsNewNode} name={displayName} account={account} txs={txs} go={go} can={id => !hiddenNav.includes(id)} labelOf={labelOf} />}
            {activeNav === 'markets' && <div className="space-y-6"><AssetCenter onAutomate={id => { setAutoAsset(id); go('automations') }} /><MarketsTab /></div>}
            {soon(activeNav) && <StateView state="unavailable" title={pt('ft.soon')} body={pt('ft.comingSoon')} />}
            {activeNav === 'automations' && !soon('automations') && !hiddenNav.includes('automations') && <AutomationCenter presetAsset={autoAsset} onPresetUsed={() => setAutoAsset(null)} />}
            {activeNav === 'premium' && !soon('premium') && !hiddenNav.includes('premium') && <PremiumCenter account={account} txs={txs} />}
            {activeNav === 'transactions' && <><TransactionsTab txs={txs} /><div className="mt-4"><LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} /></div></>}
            {activeNav === 'portfolio' && <div className="space-y-6">{!hiddenState(feature('investments')) && <InvestmentCenter go={go} focusId={focusInv} onFocusDone={() => setFocusInv(null)} onAccountChanged={fetchData} />}<section aria-labelledby="pf-analytics" className="space-y-3"><h2 id="pf-analytics" className="text-lg font-semibold tracking-tight text-fg">{t('nav2.analyticsTitle')}</h2><PortfolioTab account={account} txs={txs} hasMore={hasMore} go={go} /></section></div>}
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
            {activeNav === 'wallet' && <WalletTab account={account} />}
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
// Sections whose content has no title of its own, and the i18n key of their subtitle ('' = title only).
const INTRO_SUB: Record<string, string> = {
  transactions: '', depositHistory: '', withdrawalHistory: '', performance: 'performance.body', profile: '', security: 'security.body',
  notifications: 'notices.body', preferences: 'prefs.body', support: 'support.body', marketActivity: '', priceHistory: '',
}

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
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 cc-tabbar" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={t('shell.quickNav')}>
      <ul className="flex">
        {items.map(([id, label, I]) => {
          const on = active === id
          return (
            <li key={id} className="flex-1">
              <button onClick={() => go(id)} aria-current={on ? 'page' : undefined}
                className={`cc-tab relative w-full h-[60px] flex flex-col items-center justify-center gap-[3px] text-[10.5px] tracking-[0.01em] transition-colors active:scale-[.96] ${on ? 'text-fg font-semibold' : 'text-fg-faint font-medium hover:text-fg-muted'}`} data-tab={id}>
                <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-[background-color,color] duration-200 ${on ? 'bg-accent/[.13] text-accent' : ''}`}><I width={20} height={20} aria-hidden="true" /></span>
                <span className="leading-none">{t(label)}</span>
              </button>
            </li>
          )
        })}
        <li className="flex-1">
          <button onClick={onMenu} className="cc-tab relative w-full h-[60px] flex flex-col items-center justify-center gap-[3px] text-[10.5px] tracking-[0.01em] font-medium text-fg-faint hover:text-fg-muted active:scale-[.96]" aria-label={t('common.openMenu')} data-tab="more">
            <span className="relative flex items-center justify-center w-12 h-7"><IconMenu width={20} height={20} aria-hidden="true" />
              {unread > 0 && <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-accent ring-2 ring-[rgb(var(--ink-950))]" aria-hidden="true" />}
            </span>
            <span className="leading-none">{t('shell.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

// Inline engine state on the Automation menu row (dot + short label).
function AutomationBadge({ collapsed }: { collapsed: boolean }) {
  const { state, loading, refreshFailed } = useEngineStatus()
  const label = loading ? '…' : state === 'unavailable' && refreshFailed ? 'Error'
    : ({ running: 'Monitoring active', paused: 'Paused', maintenance: 'Maintenance', degraded: 'Delayed', offline: 'Offline', unavailable: 'Unavailable' } as const)[state]
  const dot = loading ? 'bg-fg-faint' : state === 'running' ? 'bg-emerald-400' : state === 'degraded' || state === 'paused' ? 'bg-amber-400' : state === 'maintenance' ? 'bg-sky-400' : refreshFailed ? 'bg-red-400' : 'bg-fg-faint'
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11.5px] text-fg-faint ${collapsed ? 'lg:absolute lg:top-1.5 lg:right-3' : ''}`} data-sidebar-automation={loading ? 'connecting' : state} title={label}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
    </span>
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
// "What's New" card for a release notice published from Admin → Notifications.
function WhatsNew({ n, onDismiss, onOpen }: { n: TeamNotice; onDismiss: () => void; onOpen: () => void }) {
  return (
    <section className="ov-glass ov-whatsnew relative overflow-hidden rounded-2xl p-4 sm:p-5" aria-labelledby={`wn-${n.id}`} data-whats-new={n.id}>
      <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <p className="relative text-[11px] font-medium uppercase tracking-[0.14em] text-accent">What&apos;s new</p>
      <h2 id={`wn-${n.id}`} className="relative mt-1 text-[16px] font-semibold text-fg">{n.title}</h2>
      {n.body && <p className="relative mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{n.body}</p>}
      <div className="relative mt-3.5 flex items-center gap-2">
        <button onClick={onOpen} className="btn btn-solid h-9 px-4 text-[13px]">{n.cta_label || 'Explore update'}</button>
        <button onClick={onDismiss} className="h-9 px-3 rounded-lg text-[13px] text-fg-muted hover:text-fg hover:bg-ink-850 transition-colors">Dismiss</button>
      </div>
    </section>
  )
}

// Overview card for XAI automation: the engine's verified state, when it
// last checked, and a short stream of REAL events only — the engine's own
// heartbeat and market sync timestamps plus this client's rule events.
const AUTO_EVENT: Record<string, string> = { created: 'Rule created', triggered: 'Condition met · notification sent', resumed: 'Rule resumed', paused: 'Rule paused' }
function agoShort(iso: string | null | undefined) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}
function OverviewAutomation({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  const { status, state, loading, refreshFailed, refreshed, presentation } = useEngineStatus()
  const [events, setEvents] = useState<{ id: string | number; event: string; created_at: string; asset?: string }[] | null>(null)
  // The client's own rule events, refreshed with the shared engine status.
  useEffect(() => {
    let alive = true
    authFetch('/api/client/automations').then(r => readJson<{ automations?: { id: string; asset_id: string }[]; events?: { id: number; event: string; created_at: string; automation_id: string }[] }>(r))
      .then(r => { if (!alive) return
        const asset = new Map((r.automations || []).map(a => [a.id, a.asset_id]))
        setEvents((r.events || []).map(e => ({ id: e.id, event: e.event, created_at: e.created_at, asset: asset.get(e.automation_id) }))) })
      .catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [refreshed])
  if (!presentation.panel_visible) return null
  const label = loading ? 'Connecting…' : state === 'unavailable' && refreshFailed ? 'Error'
    : ({ running: 'Monitoring active', paused: 'Paused', maintenance: 'Maintenance', degraded: 'Delayed', offline: 'Offline', unavailable: 'Unavailable' } as const)[state]
  const on = state === 'running'
  const connected = !!status && !refreshFailed
  const assets = status?.monitored?.length ? status.monitored.slice(0, 4).join(' · ') + (status.monitored_count > 4 ? ` +${status.monitored_count - 4}` : '') : presentation.asset_labels
  const stream: { key: string; label: string; at: string; tone: string }[] = []
  if (status?.last_ok_at) stream.push({ key: 'c', label: `Automation check completed${status.last_evaluated != null ? ` · ${status.last_evaluated} rule${status.last_evaluated === 1 ? '' : 's'}` : ''}`, at: status.last_ok_at, tone: 'bg-emerald-400' })
  if (status?.market_at) stream.push({ key: 'm', label: `Market monitored${status.monitored.length ? ` · ${status.monitored.slice(0, 2).join(', ')}` : ''}`, at: status.market_at, tone: 'bg-sky-400' })
  for (const e of events || []) stream.push({ key: `e${e.id}`, label: `${AUTO_EVENT[e.event] || e.event}${e.asset ? ` · ${e.asset}` : ''}`, at: e.created_at, tone: e.event === 'triggered' ? 'bg-amber-400' : 'bg-fg-faint' })
  stream.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); stream.splice(3)
  return (
    <section className="ov-glass rounded-2xl p-4 sm:p-5" aria-labelledby="ov-auto" data-ov-automation={loading ? 'connecting' : state}>
      <div className="flex items-center gap-4">
        <span className="engine-orb shrink-0 scale-[.8] -m-1" aria-hidden="true" data-engine-state={state}>
          <span className="eo-ring r1" /><span className="eo-ring r2" /><span className="eo-sweep" />
          <span className="eo-core"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></svg></span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="ov-auto" className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">{t('nav4.automation')}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold text-fg">
            <span className={`w-2 h-2 rounded-full transition-colors ${on ? 'bg-emerald-400 cc-pulse' : state === 'paused' || state === 'degraded' ? 'bg-amber-400' : 'bg-fg-faint'}`} aria-hidden="true" />{label}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success-400' : 'bg-fg-faint'}`} aria-hidden="true" />{connected ? 'Connected' : loading ? 'Connecting' : 'Not connected'}</span>
            <span className="truncate">{assets}</span>
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-lg bg-[rgb(var(--contrast)/.035)] border border-[rgb(var(--contrast)/.06)] px-3 py-2"><dt className="text-[11px] text-fg-faint">Last activity</dt><dd className="text-fg tabular-nums">{agoShort(status?.last_ok_at)}</dd></div>
        <div className="rounded-lg bg-[rgb(var(--contrast)/.035)] border border-[rgb(var(--contrast)/.06)] px-3 py-2"><dt className="text-[11px] text-fg-faint">System state</dt><dd className="text-fg truncate">{label}</dd></div>
      </dl>
      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint mb-2">XAI activity</p>
        {stream.length ? (
          <ol className="space-y-2" data-ov-activity>
            {stream.map(x => (
              <li key={x.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex items-center gap-2 min-w-0"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${x.tone}`} aria-hidden="true" /><span className="text-fg-muted truncate">{x.label}</span></span>
                <span className="text-fg-faint tabular-nums shrink-0">{agoShort(x.at)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[12.5px] text-fg-muted" data-ov-activity-empty>{loading || events === null ? 'Loading activity…' : 'No recent automation activity.'}</p>}
      </div>
      <button onClick={onOpen} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:brightness-110 min-h-9">View automation <span aria-hidden="true">→</span></button>
    </section>
  )
}

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
    <button onClick={() => go('verification')} data-kyc={status} className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[13px] font-medium backdrop-blur-sm shadow-[inset_0_1px_0_rgb(var(--contrast)/.06)] transition hover:brightness-110 active:scale-[.97] ${tone}`}>
      {status === 'verified' ? <span aria-hidden="true" className="w-4 h-4 rounded-full bg-success-500/20 grid place-items-center text-[10px]">✓</span> : <IconShield width={15} height={15} aria-hidden="true" />}
      {status === 'verified' ? <span className="uppercase tracking-[0.08em] text-[11.5px] font-semibold">KYC verified</span> : key === 'overview.kycStart' ? t(key) : `KYC · ${t(key)}`}
    </button>
  )
}

/* Overview */
function OverviewTab({ name, account, txs, go, can, labelOf, whatsNew }: { whatsNew?: ReactNode; name: string; account: Account | null; txs: Tx[]; go: (id: string) => void; can: (id: string) => boolean; labelOf: (item: { id: string; label: TKey }) => string }) {
  const feature = useFeatures()
  const recentTxs = txs.slice(0, 5)
  const pendingCount = account?.pending_transaction_count ?? txs.filter(x => x.status.startsWith('pending')).length
  const { t, intl } = useI18n()
  const totals = txTotals(txs)
  const money = (n: number) => `$${fmt(n)}`
  const inv = account?.investments ?? null
  const balRef = useRef<HTMLElement>(null)
  useScrollDepth(balRef)
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
        <section ref={balRef} data-flow={inv && inv.active_count > 0 ? "on" : undefined} className="ov-depth ov-hero relative overflow-hidden rounded-2xl border border-ink-700 p-5 sm:p-6 bg-[linear-gradient(135deg,rgb(var(--accent)/.10),rgb(var(--brand-500)/.05)_55%,transparent),rgb(var(--ink-900))] shadow-[inset_0_1px_0_rgb(var(--contrast)/.06),0_24px_48px_-28px_rgb(var(--shadow)/var(--shadow-strength))]" aria-labelledby="ov-bal">
          {/* Restrained accent light in the corner; decorative only. */}
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          {/* Faint depth grid, drifting slightly with scroll (--ov-p). */}
          <div className="ov-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          {/* Very slow gold light drifting across the panel (paused off screen
              and for reduced motion). Decorative only; no numbers move. */}
          <div className="ov-light pointer-events-none absolute inset-0" aria-hidden="true" />
          <p id="ov-bal" className="relative text-[12px] font-medium uppercase tracking-[0.12em] text-fg-faint">{t('dash.accountBalance')}</p>
          <p className="relative mt-2.5 text-[clamp(32px,9.5vw,46px)] leading-none font-semibold tracking-[-0.03em] text-fg tabular-nums break-all">
            <AnimatedPrice value={Number(account?.available_balance ?? 0)} format={money} />
          </p>
          {/* Balance first, then the two figures that change it soonest:
              profit / return and pending (the account's own recorded figures).
              Invested totals live in Portfolio → Investment Center and More →
              Account details, from the same investment records. */}
          {/* Secondary figures as one structured summary: each row is the
              backend's own value (account profit/pending; invested from the
              investment records, the same source as Investments). */}
          <dl className="ov-figures relative mt-6 border-t border-ink-700/70 divide-y divide-ink-700/50" data-overview-figures>
            {([
              ['dash.profitReturn', account ? Number(account.profit_balance ?? 0) : null, 'profit'],
              ['dash.invested', inv ? Number(inv.total_invested) : null, 'invested'],
              ['dash.pending', account ? Number(account.pending_balance ?? 0) : null, 'pending'],
            ] as [TKey, number | null, string][]).map(([label, value, key]) => (
              <div key={key} data-figure={key} className="flex items-center justify-between gap-4 py-3 min-w-0">
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-faint truncate">{t(label)}</dt>
                  {value != null && key === 'profit' && (
                    <dd className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${value > 0 ? 'text-success-400' : 'text-fg-faint'}`} data-profit-state={value > 0 ? 'positive' : 'none'}>
                      {value > 0 ? <><span aria-hidden="true">↗</span> Return recorded</> : 'No return recorded yet'}
                    </dd>
                  )}
                  {value != null && key === 'pending' && (
                    <dd className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-fg-faint" data-pending-state={value > 0 ? 'review' : 'clear'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${value > 0 ? 'bg-amber-400' : 'bg-success-400'}`} aria-hidden="true" />{value > 0 ? 'Awaiting review' : 'Clear'}
                    </dd>
                  )}
                </div>
                <dd data-value className={`text-[17px] sm:text-[19px] font-semibold tabular-nums text-right whitespace-nowrap ${key === 'profit' && value != null && value > 0 ? 'text-success-300' : 'text-fg/90'}`}>
                  {value != null ? <AnimatedPrice value={value} format={money} />
                    : !account ? <span className="inline-block h-5 w-24 rounded skeleton align-middle" aria-hidden="true" />
                    : <span className="text-[12px] font-normal text-fg-faint">{t('dash.unavailable')}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {quick.length > 0 && (
            <div className="relative mt-5">
              <p className="sr-only">{t('overview.quickActions')}</p>
              {/* One row of actions from 360px up (2x2 only on the narrowest phones),
                  so the balance stays the anchor instead of a block of tiles. */}
              <div className={`grid gap-1.5 sm:gap-2 ${quick.length >= 4 ? 'grid-cols-2 min-[360px]:grid-cols-4' : quick.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {quick.map(([id, label, I]) => (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    data-tile={id}
                    className={`ov-tile ov-tile-${id} group flex flex-col items-center justify-center gap-1.5 min-h-[66px] rounded-xl px-1 text-[11.5px] sm:text-[12.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}
                  >
                    <span className="ov-tile-icon w-7 h-7 rounded-lg grid place-items-center"><I width={16} height={16} aria-hidden="true" /></span>
                    {/* Transactions reads "Activity" here, as on the bottom bar, so it fits one row. */}
                    <span className="text-center leading-tight max-w-full truncate">{id === 'transactions' ? t('shell.activity') : labelOf({ id, label })}</span>
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

      {whatsNew}

      {/* XAI automation preview: only while Automations is enabled for clients. */}
      {can('automations') && <Rise><OverviewAutomation onOpen={() => go('automations')} /></Rise>}

      {can('portfolio') && !hiddenState(feature('investments')) && <Rise><ErrorBoundary label={t('inv.f.activeTitle')}><ActiveInvestmentsCard go={go} /></ErrorBoundary></Rise>}

      {!hiddenState(feature('trading_status')) && <TradingStatusCard
        status={account?.trading_status}
        strategyName={account?.trading_strategy_name}
        updatedAt={account?.trading_status_updated_at}
      />}

      <Rise className="grid lg:grid-cols-[1fr_1.6fr] gap-4">
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
                    <TxIcon type={tx.type} tx={tx} />
                    <div className="min-w-0">
                      <p className="text-sm text-fg truncate">{txLabel(tx, t)}{isAccountCredit(tx) && <span className="text-fg-faint font-normal"> · {t('dash.txType.accountCredit')}</span>}</p>
                      <p className="text-xs text-fg-faint">{new Date(tx.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-medium tabular-nums mb-1 ${txSign(tx) > 0 ? 'price-up' : 'text-fg'}`} data-signed-amount>{signedAmount(tx)}</p>
                    <StatusTag status={tx.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Rise>

      {can('markets') && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC / USD</span>
            <BtcFeedState />
          </div>
          <ErrorBoundary label={t('dash.theChart')}><TradingViewChart height={360} /></ErrorBoundary>
        </div>
      )}

      <DashTrustBar />
    </div>
  )
}

/* Markets */
// The chart header's status comes from the same freshness rule as every other
// market label (lib/marketStatus): "Live" only for a current BTC quote.
function BtcFeedState() {
  const { assets, error, reload } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC')
  const st = btc ? effectiveState(btc, !!error) : assets || error ? 'unavailable' : null
  if (!st) return <span className="text-fg-faint">…</span>
  const [label, dot] = st === 'live' ? ['Live', 'bg-emerald-400 live-dot'] : st === 'delayed' ? ['Delayed', 'bg-amber-400'] : st === 'stale' ? ['Stale', 'bg-amber-400'] : ['Unavailable', 'bg-fg-faint']
  const badge = <><span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}</>
  // Not live: one tap re-checks the feed (same request the 30-second refresh makes).
  return st === 'live'
    ? <span className="inline-flex items-center gap-1.5 text-fg-faint" data-btc-feed={st}>{badge}</span>
    : <button onClick={() => reload()} className="inline-flex items-center gap-1.5 text-fg-faint hover:text-fg-muted" data-btc-feed={st} title="Check again">{badge}</button>
}

function MarketsTab() {
  const { t } = useI18n()
  return (
    <div className="space-y-4 panel-in">
      <div className="grid xl:grid-cols-[1.7fr_1fr] gap-4 items-start">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-700 text-[13px]">
            <span className="text-fg">BTC / USD</span>
            <BtcFeedState />
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

// The six primary type filters. A group lists the categories it covers
// (lib/txCategory, decided by the stored source): Deposits includes account
// credits, Fees includes the Tarafab Service Fee. Profit is investment returns
// only — an admin profit-balance adjustment, a balance adjustment or a transfer
// is not guessed into a group and appears under All, with its own row label.
const TX_GROUPS: { id: string; label: TKey; cats: TxCategory[] }[] = [
  { id: 'all', label: 'common.all', cats: [] },
  { id: 'deposits', label: 'txc.gDeposits', cats: ['deposit'] },
  { id: 'investments', label: 'txc.gInvestments', cats: ['investment'] },
  { id: 'withdrawals', label: 'txc.gWithdrawals', cats: ['withdrawal'] },
  { id: 'profit', label: 'txc.gProfit', cats: ['profit'] },
  { id: 'fees', label: 'txc.gFees', cats: ['fee'] },
]

function TransactionsTab({ txs }: { txs: Tx[] }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { t, intl } = useI18n()
  // Everything filters the records already loaded; nothing is re-fetched.
  const q = query.trim().toLowerCase()
  const group = TX_GROUPS.find(g => g.id === filter) || TX_GROUPS[0]
  const filtered = txs.filter(x => {
    if (group.cats.length && !group.cats.includes(txCategory(x))) return false
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
      {/* One row of type chips; scrolls sideways on narrow screens, never wraps. */}
      <div role="group" aria-label={t('txc.typeGroup')} className="tx-chips no-scrollbar -mx-4 px-4 sm:-mx-1 sm:px-1" data-tx-chips>
        {TX_GROUPS.map(g => {
          const on = filter === g.id
          return (
            <button key={g.id} type="button" aria-pressed={on} onClick={() => setFilter(g.id)}
              className={`tx-chip ${on ? 'tx-chip-on' : ''}`} data-tx-group={g.id}>
              {on && <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>}
              {t(g.label)}
            </button>
          )
        })}
      </div>
      <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto_auto]" data-tx-filters>
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
                        <span className="inline-flex items-center gap-2.5"><TxIcon type={tx.type} tx={tx} /><span className="text-fg">{txLabel(tx, t)}</span></span>
                        {isAccountCredit(tx) ? <p className="text-xs text-fg-faint pl-[42px]">{t('dash.txType.accountCredit')}</p>
                          : tx.method && tx.type !== 'adjustment' && methodLabel(tx.method, t) !== txLabel(tx, t) && <p className="text-xs text-fg-faint pl-[42px]">{tx.type === 'withdrawal' ? t(tx.method === 'profit_balance' ? 'withdraw.fromProfit' : 'withdraw.fromAvailable') : methodLabel(tx.method, t)}</p>}
                      </td>
                      <td className={`px-5 py-3.5 text-right tabular-nums ${txSign(tx) > 0 ? 'price-up' : 'text-fg'}`} data-signed-amount>{signedAmount(tx)}</td>
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
            {/* Phones: a timeline grouped by day, compact rows. */}
            <div className="md:hidden" data-tx-timeline>
              {dayGroups(filtered, intl).map(([day, list]) => (
                <section key={day} aria-label={day}>
                  <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint">{day}</h3>
                  <ul className="divide-y divide-[rgb(var(--contrast)/.06)]">
                    {list.map(tx => (
                      <li key={tx.id} className="flex items-center gap-3 px-4 py-3" data-tx-row={tx.status}>
                        <TxIcon type={tx.type} tx={tx} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-fg truncate">{txLabel(tx, t)}{isAccountCredit(tx) && <span className="text-fg-faint"> · {t('dash.txType.accountCredit')}</span>}</p>
                          <p className="text-[12px] text-fg-faint truncate">
                            {new Date(tx.created_at).toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit' })}
                            {tx.reference ? <> · <span className="font-mono">{tx.reference}</span></> : null}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[14px] font-semibold tabular-nums ${txSign(tx) > 0 ? 'price-up' : 'text-fg'}`} data-signed-amount>{signedAmount(tx)}</p>
                          <StatusTag status={tx.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-ink-700 text-xs text-fg-faint">
              {filtered.length === 1 ? t('dash.txCountOne') : t('dash.txCountMany', { n: filtered.length })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Groups transactions (newest first) by calendar day: "Today",
// "Yesterday" (localised by Intl), otherwise the date.
function dayGroups(list: Tx[], intl: string): [string, Tx[]][] {
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' })
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOf(new Date())
  const out: [string, Tx[]][] = []
  for (const tx of [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const d = new Date(tx.created_at)
    const diff = Math.round((startOf(d) - today) / 86_400_000)
    const raw = diff === 0 || diff === -1 ? rtf.format(diff, 'day') : d.toLocaleDateString(intl, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
    const label = raw.charAt(0).toUpperCase() + raw.slice(1)
    const last = out[out.length - 1]
    if (last && last[0] === label) last[1].push(tx); else out.push([label, [tx]])
  }
  return out
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
  const [sheet, setSheet] = useState(false)
  // Crypto options (ETH, USDT · BNB Smart Chain, …) come from Admin → Fees &
  // Transfers → Tarafab receiving addresses: each is shown only while its
  // record is enabled and valid (checked by the server).
  type CryptoOpt = { asset: string; network: string; chain_id: number; address: string; min_confirmations: number; token_contract: string | null; decimals: number; standard?: string }
  const [opts, setOpts] = useState<CryptoOpt[] | undefined>(undefined)
  const [ethNotice, setEthNotice] = useState('')
  const [ethAmount, setEthAmount] = useState('')
  const [txHash, setTxHash] = useState('')
  const [fromAddr, setFromAddr] = useState('')
  useEffect(() => {
    let live = true
    authFetch('/api/client/deposit-options').then(r => readJson<{ options?: CryptoOpt[]; ethereum: { unavailable?: boolean } | null }>(r)).then(j => {
      if (!live) return
      setOpts(Array.isArray(j.options) ? j.options : [])
      setEthNotice(j.ethereum?.unavailable ? 'Ethereum deposits are temporarily unavailable.' : '')
    }).catch(e => { console.error('Deposit options could not be loaded', e); if (live) { setOpts([]); setEthNotice('Ethereum deposit address is currently unavailable.') } })
    return () => { live = false }
  }, [])
  const optKey = (o: CryptoOpt) => (o.asset === 'ETH' && o.chain_id === 1 ? 'ethereum' : `crypto:${o.asset}:${o.chain_id}`)
  const optLabel = (o: CryptoOpt) => (o.asset === 'ETH' && o.chain_id === 1 ? 'Ethereum (ETH) · Ethereum Network' : `${o.asset} · ${o.network}`)
  const sel = (opts || []).find(o => optKey(o) === method) || null
  useEffect(() => { if (opts && method !== 'bitcoin' && (method === 'ethereum' || method.startsWith('crypto:')) && !sel) setMethod('bitcoin') }, [opts, method, sel])
  const isEth = !!sel
  const eth = sel
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
    navigator.clipboard.writeText(isEth ? eth!.address : BTC_ADDRESS).then(() => {
      // One confirmation only: the button itself reads "Copied".
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError(t('deposit.errAmount')); return }
    if (file && !isAllowedUpload(file)) { setError(t('deposit.errType')); return }
    if (isEth) {
      if (!(parseFloat(ethAmount) > 0)) { setError(`Enter the amount of ${sel!.asset} you sent.`); return }
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) { setError(`Enter a valid ${sel!.network} transaction hash (0x followed by 64 characters).`); return }
      if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddr.trim())) { setError(`Enter the ${sel!.network} address you sent from (0x followed by 40 characters).`); return }
    }
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
        body: JSON.stringify({ amount: amt, method, receipt_path: receiptPath, notes: notes.trim() || undefined,
          ...(isEth ? { method: 'crypto', asset: sel!.asset, chain_id: sel!.chain_id, crypto_amount: parseFloat(ethAmount), tx_hash: txHash.trim(), from_address: fromAddr.trim() } : {}) }),
      }))

      setSuccess({ reference: data.deposit?.reference || '' })
      setAmount('')
      setNotes(''); setEthAmount(''); setTxHash(''); setFromAddr('')
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

  // Every method the system offers. Crypto options are exactly the enabled
  // receiving addresses (asset + network pairs) from the server.
  const ASSET_INFO: Record<string, { glyph: string; name: string; tone: string }> = {
    BTC: { glyph: '₿', name: 'Bitcoin', tone: 'bg-amber-500/15 text-amber-300' }, ETH: { glyph: 'Ξ', name: 'Ethereum', tone: 'bg-sky-500/15 text-sky-300' },
    USDT: { glyph: 'T', name: 'Tether USD', tone: 'bg-emerald-500/15 text-emerald-300' }, USDC: { glyph: '$', name: 'USD Coin', tone: 'bg-blue-500/15 text-blue-300' },
  }
  const choices: { value: string; glyph: string; tone: string; title: string; sub: string; group: 'crypto' | 'other' }[] = [
    { value: 'bitcoin', ...ASSET_INFO.BTC, title: 'Bitcoin', sub: 'BTC · Bitcoin Network', group: 'crypto' },
    ...(opts || []).map(o => { const i = ASSET_INFO[o.asset] || { glyph: o.asset.slice(0, 1), name: o.asset, tone: 'bg-ink-700 text-fg' }
      return { value: optKey(o), glyph: i.glyph, tone: i.tone, title: i.name, sub: `${o.asset} · ${o.network}${o.standard && o.standard !== 'Native' ? ` · ${o.standard}` : o.asset === 'ETH' ? ' Network' : ''}`, group: 'crypto' as const } }),
    { value: 'bank_transfer', glyph: '🏦', tone: 'bg-ink-700 text-fg-muted', title: t('dash.method.bank_transfer'), sub: 'Reviewed by our team', group: 'other' },
    { value: 'wire_transfer', glyph: '⇄', tone: 'bg-ink-700 text-fg-muted', title: t('dash.method.wire_transfer'), sub: 'Reviewed by our team', group: 'other' },
    { value: 'other', glyph: '…', tone: 'bg-ink-700 text-fg-muted', title: t('dash.method.other'), sub: 'Describe it in the notes', group: 'other' },
  ]
  const current = choices.find(c => c.value === method) || choices[0]
  const isCrypto = method === 'bitcoin' || !!sel
  const recvAddress = isEth ? eth!.address : BTC_ADDRESS
  return (
    <div className="dep max-w-2xl mx-auto">
      <header className="mb-6">
        <h2 className="text-[22px] font-semibold tracking-tight text-fg">Deposit</h2>
        <p className="mt-0.5 text-[14px] text-fg-muted">Fund your account securely.</p>
      </header>


      {/* Receiving details — only for crypto methods; one compact surface */}
      {isCrypto && (
        <section aria-labelledby="dep-recv">
          <h3 id="dep-recv" className="dep-h">Receiving details</h3>
          <div className="dep-surface mt-3" data-deposit-asset={isEth ? eth!.asset : 'BTC'} data-chain-id={isEth ? eth!.chain_id : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-fg">{isEth ? (eth!.asset === 'ETH' && eth!.chain_id === 1 ? 'Ethereum (ETH)' : eth!.asset) : 'Bitcoin (BTC)'}</span>
              <span className="rounded-full border border-[rgb(var(--contrast)/.12)] bg-[rgb(var(--contrast)/.04)] px-2 py-0.5 text-[11px] text-fg-muted">
                {isEth ? `${eth!.network}${eth!.standard && eth!.standard !== 'Native' ? ` · ${eth!.standard}` : ' Network'}` : 'Bitcoin Network'}
              </span>
            </div>
            <div className="mt-3 flex gap-4 items-start">
              <div className="min-w-0 flex-1">
                <label className="text-[12px] text-fg-faint">{isEth ? `${eth!.asset} receiving address` : t('deposit.address')}</label>
                <div className="mt-1 px-3 py-2.5 rounded-xl bg-ink-950/70 border border-[rgb(var(--contrast)/.1)] font-mono text-[13px] leading-relaxed text-fg break-all select-all" data-eth-address={isEth ? '' : undefined} data-receiving-address>{recvAddress}</div>
                <button onClick={copyAddress} type="button" className="mt-2 btn btn-outline btn-sm" aria-label={isEth ? `Copy ${eth!.asset} address` : t('deposit.copyAddress')}>
                  {copied ? <><IconCheck width={15} height={15} />{t('common.copied')}</> : <><IconCopy width={15} height={15} />{t('common.copy')}</>}
                </button>
              </div>
              <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 bg-[#fff] rounded-lg p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={isEth ? `https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=${eth!.asset === 'ETH' && eth!.chain_id === 1 ? 'ethereum:' : ''}${eth!.address}` : `https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=bitcoin:${BTC_ADDRESS}`}
                  alt={isEth ? `QR code for the Tarafab ${eth!.asset} address on ${eth!.network}` : t('deposit.qrAlt')} className="w-full h-full" />
              </div>
            </div>
            {isEth && (
              <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[12.5px]">
                <div><dt className="text-fg-faint">Network</dt><dd className="text-fg">{eth!.network} <span className="text-fg-faint">(chain {eth!.chain_id})</span></dd></div>
                <div><dt className="text-fg-faint">Confirmations</dt><dd className="text-fg tabular-nums" data-confirmations>{eth!.min_confirmations}+</dd></div>
                {eth!.standard && eth!.standard !== 'Native' && <div><dt className="text-fg-faint">Token standard</dt><dd className="text-fg">{eth!.standard}</dd></div>}
                {eth!.token_contract && <div className="col-span-2 sm:col-span-3"><dt className="text-fg-faint">Token contract</dt><dd className="text-fg font-mono text-[11.5px] break-all" data-token-contract>{eth!.token_contract}</dd></div>}
              </dl>
            )}
            <div role="note" className="dep-warn mt-3">
              <IconAlert className="shrink-0 text-amber-400 mt-px" width={15} height={15} aria-hidden="true" />
              <span>{isEth
                ? (eth!.asset === 'ETH' && eth!.chain_id === 1
                  ? 'Send only ETH on the Ethereum network (Ethereum Mainnet) to this address. Do not send Bitcoin, tokens, or ETH on another network (such as Base, Arbitrum or BNB Smart Chain): those funds may be lost.'
                  : `Send only ${eth!.asset} on the selected network — ${eth!.network}${eth!.standard && eth!.standard !== 'Native' ? ` (${eth!.standard})` : ''}, chain ${eth!.chain_id} — to this address. Sending any other asset, or ${eth!.asset} through another network (for example ${eth!.chain_id === 56 ? 'Ethereum / ERC-20' : 'BNB Smart Chain / BEP-20'}), can result in permanent loss of funds.`)
                : t('deposit.warning')}{isEth && <> Your deposit stays pending until Tarafab verifies the transaction on-chain ({eth!.min_confirmations}+ confirmations).</>}</span>
            </div>
          </div>
        </section>
      )}

      {/* Tell us about the transfer — plain section, no giant card */}
      <section aria-labelledby="dep-tell" className="mt-8">
        <h3 id="dep-tell" className="dep-h">Tell us about the transfer</h3>
        <p className="mt-0.5 mb-4 text-[12.5px] text-fg-faint">{t('deposit.step2Body')}</p>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && <FormError message={error} />}

          <div>
            <label htmlFor="amount" className="field-label">{t('deposit.amount')}</label>
            <input id="amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required className="field tabular-nums" disabled={submitting} />
          </div>

          {/* Payment method: the only selector on the page. Opens the bottom sheet. */}
          <div>
            <span id="dep-method-label" className="field-label">{t('deposit.method')}</span>
            <button type="button" onClick={() => setSheet(true)} disabled={submitting} className="field text-left flex items-center gap-3" aria-haspopup="dialog" aria-expanded={sheet} aria-labelledby="dep-method-label dep-method-value" data-method-trigger>
              <span className={`w-7 h-7 shrink-0 rounded-lg grid place-items-center text-[13px] font-semibold ${current.tone}`} aria-hidden="true">{current.glyph}</span>
              <span id="dep-method-value" className="min-w-0 flex-1 truncate">{current.title} <span className="text-fg-faint">· {current.sub}</span></span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-faint shrink-0" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {ethNotice && <p className="mt-2 text-[12px] text-amber-300" role="status">{ethNotice}</p>}
          </div>

          {isEth && (
            <div className="space-y-4" data-eth-fields>
              <div>
                <label htmlFor="eth-amount" className="field-label">Amount of {eth!.asset} sent</label>
                <input id="eth-amount" type="number" inputMode="decimal" step="any" min="0" value={ethAmount} onChange={e => setEthAmount(e.target.value)} placeholder="0.00" className="field tabular-nums" disabled={submitting} />
              </div>
              <div>
                <label htmlFor="eth-tx" className="field-label">Transaction hash</label>
                <input id="eth-tx" type="text" value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" disabled={submitting} />
              </div>
              <div>
                <label htmlFor="eth-from" className="field-label">Sender address (the wallet you sent from)</label>
                <input id="eth-from" type="text" value={fromAddr} onChange={e => setFromAddr(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" disabled={submitting} />
              </div>
              <p className="text-[12px] text-fg-faint">Submitting does not credit your balance. The deposit stays pending until Tarafab verifies the transaction hash, destination address, network, amount and confirmations.</p>
            </div>
          )}

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
      </section>

      {sheet && <MethodSheet choices={choices.filter(c => c.group === 'other' || opts !== undefined || c.value === 'bitcoin')} loading={opts === undefined} value={method} onPick={setMethod} onClose={() => setSheet(false)} />}
    </div>
  )
}

// Tarafab payment-method sheet: bottom sheet on phones, centred dialog on
// larger screens. Escape / backdrop close it; picking applies the method.
// Payment-method picker: a true bottom sheet on phones (compact centred
// dialog on larger screens). It is portalled to <body> above everything; the
// rest of the app is made inert while it is open (no taps, focus or screen
// reader on the page underneath), page scroll is locked, Smartsupp is hidden
// behind it, and focus is trapped inside. Closes on pick, backdrop tap,
// drag-down, or Escape; dismissing keeps the current selection.
function MethodSheet({ choices, value, loading, onPick, onClose, title = 'Choose payment method' }: { choices: { value: string; glyph: string; tone: string; title: string; sub: string; group: 'crypto' | 'other' }[]; value: string; loading?: boolean; onPick: (v: string) => void; onClose: () => void; title?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  // Animate out, then hand control back (pick first so the page updates under the closing sheet).
  const close = useCallback((pick?: string) => {
    if (closing) return
    if (pick !== undefined) onPick(pick)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { onClose(); return }
    setClosing(true); setTimeout(onClose, 180)
  }, [closing, onPick, onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const html = document.documentElement, prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    document.body.classList.add('dialog-open')
    // Everything else on the page becomes inert while the sheet is open.
    const others = Array.from(document.body.children).filter(el => el !== ref.current?.closest('[data-sheet-root]')) as HTMLElement[]
    const was = others.map(el => [el.inert, el.getAttribute('aria-hidden')] as const)
    others.forEach(el => { el.inert = true; el.setAttribute('aria-hidden', 'true') })
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus() ?? ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      html.style.overflow = prevOverflow
      document.body.classList.remove('dialog-open')
      others.forEach((el, i) => { el.inert = was[i][0]; if (was[i][1] === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', was[i][1]!) })
      opener?.focus?.()
    }
  }, [])

  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return }
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button[data-sheet-option]') || [])
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus() }
    if (e.key === 'Tab') { // focus trap
      const all = Array.from(ref.current?.querySelectorAll<HTMLElement>('button') || [])
      if (!all.length) return
      const first = all[0], last = all[all.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
  // Drag down to dismiss: from the handle/title always, from the list only when it is scrolled to the top.
  const onDown = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse') return
    const fromList = (e.target as HTMLElement).closest('[data-sheet-list]')
    if (fromList && (ref.current?.scrollTop || 0) > 0) return
    drag.current = { y: e.clientY, t: Date.now(), dy: 0 }
  }
  const onMove = (e: RPointerEvent) => { if (!drag.current) return; drag.current.dy = Math.max(0, e.clientY - drag.current.y); setDragY(drag.current.dy) }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    // A long pull or a quick flick closes; anything else springs back.
    if (d.dy > 90 || d.dy / Math.max(1, Date.now() - d.t) > 0.6) close(); else setDragY(0)
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div data-sheet-root className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onKeyDown={onKey}>
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-[6px] ${closing ? 'sheet-fade-out' : 'backdrop-in'}`} onClick={() => close()} aria-hidden="true" data-sheet-backdrop />
      <div ref={ref}
        className={`dep-sheet relative w-full sm:max-w-md max-h-[78dvh] overflow-y-auto overscroll-contain rounded-t-[22px] sm:rounded-2xl px-3 pt-2.5 pb-[calc(14px+env(safe-area-inset-bottom))] sm:p-4 ${closing ? 'sheet-out' : ''}`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-method-sheet>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[rgb(var(--contrast)/.22)] sm:hidden touch-none" aria-hidden="true" data-sheet-handle />
        <p id="sheet-title" className="px-2 text-[16px] font-semibold text-fg touch-none">{title}</p>
        <div role="radiogroup" aria-labelledby="sheet-title" className="mt-2.5 space-y-0.5" data-sheet-list>
          {choices.map(c => {
            const on = c.value === value
            return (
              <button key={c.value} type="button" role="radio" aria-checked={on} aria-label={`${c.title}, ${c.sub}`} onClick={() => close(c.value)} data-sheet-option={c.value}
                className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${on ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : 'hover:bg-[rgb(var(--contrast)/.04)]'}`}>
                <span className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center text-[14px] font-semibold ${c.tone}`} aria-hidden="true">{c.glyph}</span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] text-fg truncate">{c.title}</span><span className="block text-[12.5px] text-fg-faint truncate">{c.sub}</span></span>
                {on && <IconCheck width={18} height={18} className="text-accent shrink-0" aria-hidden="true" />}
              </button>
            )
          })}
          {loading && <p className="px-2.5 py-3 text-[13px] text-fg-faint flex items-center gap-2"><Spinner /> Loading more methods…</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* Withdraw */
const SOURCES = [
  { id: 'available_balance', label: 'withdraw.availableBalance', short: 'withdraw.availableShort' },
  { id: 'profit_balance', label: 'withdraw.profitBalance', short: 'withdraw.profitShort' },
] as const
type Source = typeof SOURCES[number]['id']
type WithdrawalWallet = { id: string; network: string; address: string; label: string; wallet_name: string; status: string; verification_status: string }

function WithdrawTab({ account, txs, onSuccess }: { account: Account | null; txs: Tx[]; onSuccess: () => void }) {
  const [source, setSource] = useState<Source>('available_balance')
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [wallets, setWallets] = useState<WithdrawalWallet[]>([])
  const [walletLoadError, setWalletLoadError] = useState('')
  const [destinationWalletId, setDestinationWalletId] = useState('')
  const [destSheet, setDestSheet] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const { t, intl } = useI18n()
  const toast = useToast()
  const attemptKey = useRef(newRequestKey())
  const inFlight = useRef(false)
  const amtNum = Math.round(parseFloat(amount) * 100) / 100
  // The destination's network decides which fee rule applies (manual addresses are Bitcoin).
  // A linked & verified wallet = External Wallet Transfer (the server decides
  // the service and its fee rule from the wallet id); a typed address = Normal
  // Withdrawal on that address's network (Bitcoin).
  const feeWallet = wallets.find(w => w.id === destinationWalletId)
  const feeQ = useServiceFee('withdrawal', amtNum > 0 ? amtNum : 0, feeWallet ? { walletId: feeWallet.id } : { network: 'Bitcoin' })
  useEffect(() => {
    let active = true
    authFetch('/api/client/wallets')
      .then(readJson<{ wallets: WithdrawalWallet[] }>)
      .then(result => {
        if (active) setWallets(result.wallets.filter(wallet => wallet.status === 'linked' && wallet.verification_status === 'verified'))
      })
      .catch(err => { if (active) setWalletLoadError(errorText(err, t)) })
    return () => { active = false }
  }, [t])
  useEffect(() => { attemptKey.current = newRequestKey() }, [source, amount, address, destinationWalletId, notes])

  const withdrawals = txs.filter(t => t.type === 'withdrawal')
  const reserved = (src: Source) => withdrawals.filter(t => t.method === src && OPEN_STATUSES.includes(t.status)).reduce((s, t) => s + Number(t.amount), 0)
  const balanceOf = (src: Source) => Number((src === 'profit_balance' ? account?.profit_balance : account?.available_balance) ?? 0)
  const withdrawable = (src: Source) => Math.max(0, Math.round((balanceOf(src) - reserved(src)) * 100) / 100)
  const max = withdrawable(source)
  const selectedWallet = wallets.find(wallet => wallet.id === destinationWalletId)
  // Destination options for the bottom sheet: a typed Bitcoin address, or a verified wallet.
  const destChoices: { value: string; glyph: string; tone: string; title: string; sub: string; group: 'crypto' | 'other' }[] = [
    { value: '', glyph: '₿', tone: 'bg-amber-500/15 text-amber-300', title: 'Enter a Bitcoin address', sub: 'Paste it in the field below', group: 'other' },
    ...wallets.map(w => ({ value: w.id, glyph: '◈', tone: 'bg-sky-500/15 text-sky-300', title: w.wallet_name || w.label || 'Verified wallet', sub: `${w.network} · ${w.address.length > 12 ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}` : w.address}`, group: 'crypto' as const })),
  ]
  const destChoice = destChoices.find(c => c.value === destinationWalletId) || destChoices[0]
  const destinationAddress = selectedWallet?.address || address.trim()

  // Submitting validates and opens a review of exactly what will be sent;
  // only Confirm in that review makes the request.
  const [review, setReview] = useState<{ amt: number; walletId: string | null; address: string; network: string } | null>(null)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!amt || amt <= 0) { setError(t('withdraw.errAmount')); return }
    if (amt > max) { setError(t('withdraw.errMax', { max: `$${fmt(max)}` })); return }
    if (destinationWalletId && !selectedWallet) { setError('Select a currently linked, verified wallet.'); return }
    if (!selectedWallet && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/.test(address.trim())) { setError(t('withdraw.errAddress')); return }
    setReview({ amt, walletId: selectedWallet?.id || null, address: destinationAddress, network: selectedWallet?.network || 'Bitcoin' })
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
        body: JSON.stringify({
          amount: amt,
          source,
          ...(review.walletId ? { wallet_id: review.walletId } : { address: review.address }),
          notes: notes.trim() || undefined,
        }),
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
    <div className="dep max-w-2xl mx-auto">
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
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">Service</dt><dd className="text-fg text-right" data-review-service>{feeQ.state === 'ok' && feeQ.service ? (feeQ.service === 'wallet_withdrawal' ? 'External Wallet Transfer' : 'Normal Withdrawal') : '…'}</dd></div>
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">Asset · Network</dt><dd className="text-fg text-right">{feeQ.state === 'ok' && feeQ.asset ? `${feeQ.asset} · ` : ''}{review.network}</dd></div>
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('withdraw.amount')}</dt><dd className="text-fg font-semibold tabular-nums">${fmt(review.amt)}</dd></div>
            <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('withdraw.from')}</dt><dd className="text-fg">{t(source === 'profit_balance' ? 'withdraw.profitShort' : 'withdraw.availableShort')}</dd></div>
            <div className="py-2.5"><dt className="text-fg-muted mb-1">{review.walletId ? 'Destination (linked wallet)' : t('withdraw.yourAddress')} · {review.network}</dt><dd className="text-fg font-mono text-[13px] break-all">{review.address}</dd></div>
          </dl>
          <div className="mt-3"><FeeRows q={feeQ} amount={review.amt} kind="withdrawal" /></div>
          <p className="mt-4 text-[13px] text-fg-muted leading-relaxed">{t('withdraw.reviewNote')}</p>
        </ConfirmModal>
      )}
      <header className="mb-6">
        <h2 className="text-[22px] font-semibold tracking-tight text-fg">{t('withdraw.title')}</h2>
        <p className="mt-0.5 text-[14px] text-fg-muted">{t('withdraw.body')}</p>
      </header>

      <section aria-label={t('withdraw.title')}>
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
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {SOURCES.map(s => (
              <label key={s.id} className={`dep-choice min-w-0 ${source === s.id ? 'dep-choice-on' : ''}`}>
                <input type="radio" name="source" value={s.id} checked={source === s.id} onChange={() => { setSource(s.id); setError('') }} className="sr-only" />
                <span className={`dep-radio ${source === s.id ? 'dep-radio-on' : ''}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-fg truncate">{t(s.short)}</span>
                  <span className="block text-[12px] text-fg-faint tabular-nums truncate"><span className="sm:hidden">${fmt(withdrawable(s.id))}</span><span className="hidden sm:inline">{t('withdraw.availableAmount', { amount: `$${fmt(withdrawable(s.id))}` })}</span></span>
                </span>
              </label>
            ))}
          </div>
          {/* Pending requests hold part of a balance; say so where the choice is made. */}
          {reserved(source) > 0 && <p className="text-xs text-fg-faint mt-2" data-reserved-note>{t('withdraw.reserved', { reserved: `$${fmt(reserved(source))}`, left: `$${fmt(withdrawable(source))}` })}</p>}
        </fieldset>

        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label htmlFor="w-amount" className="field-label !mb-0">{t('withdraw.amount')}</label>
            <button type="button" onClick={() => setAmount(max > 0 ? max.toFixed(2) : '')} className="text-[13px] text-fg-muted hover:text-fg disabled:opacity-40" disabled={max <= 0}>{t('withdraw.max')}</button>
          </div>
          <input id="w-amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="field tabular-nums" disabled={submitting} />
          <div className="mt-2"><FeeRows q={feeQ} amount={amtNum} kind="withdrawal" /></div>
        </div>

        <div>
          <span id="w-destination-label" className="field-label">Withdrawal destination</span>
          {/* Same Tarafab bottom sheet as Deposit: a Bitcoin address, or one of the verified wallets. */}
          <button type="button" id="w-destination" onClick={() => setDestSheet(true)} disabled={submitting} className="field text-left flex items-center gap-3" aria-haspopup="dialog" aria-expanded={destSheet} aria-labelledby="w-destination-label w-destination-value" data-destination={destinationWalletId}>
            <span className={`w-7 h-7 shrink-0 rounded-lg grid place-items-center text-[13px] font-semibold ${destChoice.tone}`} aria-hidden="true">{destChoice.glyph}</span>
            <span id="w-destination-value" className="min-w-0 flex-1 truncate">{destChoice.title} <span className="text-fg-faint">· {destChoice.sub}</span></span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-faint shrink-0" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {destSheet && <MethodSheet title="Withdrawal destination" choices={destChoices} value={destinationWalletId} onPick={v => { setDestinationWalletId(v); setAddress(''); setError('') }} onClose={() => setDestSheet(false)} />}
          {selectedWallet ? (
            <p className="mt-2 break-all font-mono text-xs text-fg-muted">{selectedWallet.address}</p>
          ) : (
            <>
              <label htmlFor="w-address" className="sr-only">{t('withdraw.yourAddress')}</label>
              <input id="w-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="bc1..." autoComplete="off" spellCheck={false} className="field mt-2 font-mono text-[13px]" disabled={submitting} />
              <p className="text-xs text-fg-faint mt-1.5">{t('withdraw.addressHelp')}</p>
            </>
          )}
          {walletLoadError && <p role="status" className="mt-2 text-xs text-amber-300">Verified wallets could not be loaded. You can still enter a Bitcoin address.</p>}
        </div>

        <div>
          <label htmlFor="w-notes" className="field-label">{t('common.notes')}</label>
          <textarea id="w-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field resize-none" disabled={submitting} />
        </div>

        <button type="submit" disabled={submitting || max <= 0} className="btn btn-solid w-full">
          {submitting ? <><Spinner />{t('common.submitting')}</> : max <= 0 ? t('withdraw.nothing') : t('withdraw.review')}
        </button>
      </form>
      </section>

      <section aria-labelledby="wd-requests" className="mt-8">
        <h3 id="wd-requests" className="dep-h">{t('withdraw.requests')}</h3>
        <div className="dep-surface mt-3 !p-0 overflow-hidden" data-withdraw-requests>
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
      </section>

      {/* Reference material stays one tap away instead of two extra cards. */}
      <section className="mt-8 divide-y divide-ink-700/70 border-y border-ink-700/70 text-sm" data-withdraw-info>
        <details className="group py-3">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-fg">{t('withdraw.how')}<span className="text-fg-faint transition-transform group-open:rotate-180" aria-hidden="true">▾</span></summary>
          <ol className="mt-2 space-y-1.5 text-fg-muted list-decimal pl-5">
            <li>{t('withdraw.how1')}</li>
            <li>{t('withdraw.how2')}</li>
            <li>{t('withdraw.how3')}</li>
            <li>{t('withdraw.how4')}</li>
          </ol>
        </details>
        <details className="group py-3">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-fg">{t('withdraw.help')}<span className="text-fg-faint transition-transform group-open:rotate-180" aria-hidden="true">▾</span></summary>
          <p className="mt-2 text-fg-muted">{t('withdraw.helpBody')}</p>
          <div className="mt-3">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account support')}`} className="btn btn-outline w-full sm:w-auto break-all">
            <IconMail width={17} height={17} />{SUPPORT_EMAIL}
            </a>
          </div>
        </details>
      </section>
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
    <div className="max-w-lg space-y-6">
      <SettingsSection title={t('profile.details')} id="pf-details">
        {rows.map(([label, value]) => <SettingsRow key={label} label={t(label)} value={<span className="break-words tabular-nums">{value}</span>} />)}
        <SettingsRow label={t('common.password')} sub={t('profile.passwordBody')}
          action={<Link href="/forgot-password" className="btn btn-sm btn-outline whitespace-nowrap">{t('profile.changePassword')}</Link>} />
      </SettingsSection>
    </div>
  )
}

// The dashboard's trust bar reports the shared market feed's real state.
function DashTrustBar() {
  const { assets, error } = useAssets()
  return <TrustBar marketStatus={feedStatus(assets, error)} />
}

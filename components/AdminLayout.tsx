'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import type { ComponentType, SVGProps } from 'react'
import { PageIntro } from '@/components/dashboard/shared'
import {
  Logo, IconArrowDown, IconArrowUp, IconBell, IconChart, IconCheck, IconFile, IconGrid, IconHistory, IconIdCard, IconInbox,
  IconList, IconLock, IconMonitor, IconPie, IconRadar, IconSliders, IconSwap, IconUser, IconWallet,
} from '@/components/Icons'

type Props = {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export default function AdminLayout({ children, title, subtitle }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const supabase = createClient()
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { t } = useI18n()

  // Access is enforced by the database on every admin query; this check only
  // decides what to render. A connection failure shows a retry instead of
  // treating the admin as signed out.
  useEffect(() => {
    let alive = true
    const check = async () => {
      setCheckFailed(false)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/admin/login'); return }
        const { data: profile, error } = await (supabase.from('profiles') as any)
          .select('role, full_name').eq('id', session.user.id).maybeSingle() as { data: { role?: string; full_name?: string } | null; error: { message: string } | null }
        if (!alive) return
        if (error) {
          if (/jwt/i.test(error.message)) { router.replace('/admin/login'); return }
          setCheckFailed(true); setLoading(false); return
        }
        if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
        setAdminName(profile?.full_name || 'Admin')
        // Staff device: the support chat should not count this browser as a
        // new visitor when staff open public pages (see SmartsuppWidget).
        try { localStorage.setItem('tarafab.staffDevice', '1') } catch { /* storage blocked */ }
        setLoading(false)
      } catch {
        if (alive) { setCheckFailed(true); setLoading(false) }
      }
    }
    check()
    return () => { alive = false }
  }, [attempt, router, supabase])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') router.replace('/admin/login')
    })
    return () => subscription.unsubscribe()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  // Same menu as before; each entry now has a line icon (as in the client app).
  const navItems: { label: TKey; icon: ComponentType<SVGProps<SVGSVGElement>>; href: string }[] = [
    { label: 'admin.nav.dashboard', icon: IconGrid, href: '/admin' },
    { label: 'admin.nav.clients', icon: IconUser, href: '/admin/clients' },
    { label: 'admin.nav.transactions', icon: IconList, href: '/admin/transactions' },
    { label: 'admin.nav.deposits', icon: IconArrowDown, href: '/admin/transactions?type=deposit' },
    { label: 'admin.nav.withdrawals', icon: IconArrowUp, href: '/admin/transactions?type=withdrawal' },
    { label: 'admin.nav.verification', icon: IconIdCard, href: '/admin/verification' },
    { label: 'admin.nav.investments', icon: IconPie, href: '/admin/investments' },
    { label: 'admin.nav.wallets', icon: IconWallet, href: '/admin/wallets' },
    { label: 'admin.nav.transfers', icon: IconSwap, href: '/admin/transfers' },
    { label: 'admin.nav.fees', icon: IconFile, href: '/admin/fees' },
    { label: 'admin.nav.reconciliation', icon: IconCheck, href: '/admin/reconciliation' },
    { label: 'admin.nav.assets', icon: IconChart, href: '/admin/assets' },
    { label: 'admin.nav.automations', icon: IconRadar, href: '/admin/automations' },
    { label: 'admin.nav.premium', icon: IconLock, href: '/admin/premium' },
    { label: 'admin.nav.payments', icon: IconInbox, href: '/admin/payments' },
    { label: 'admin.nav.features', icon: IconMonitor, href: '/admin/features' },
    { label: 'admin.nav.notifications', icon: IconBell, href: '/admin/notifications' },
    { label: 'admin.nav.auditLogs', icon: IconHistory, href: '/admin/audit-logs' },
    { label: 'admin.nav.settings', icon: IconSliders, href: '/admin/settings' },
  ]

  // Section icon for the page banner: the menu entry for this page.
  const current = navItems.find(i => i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href.split('?')[0]))

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (checkFailed) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
          <p className="text-white font-medium mb-1">{t('admin.verifyFailed')}</p>
          <p className="text-sm text-fg-muted mb-5">{t('admin.verifyFailedBody')}</p>
          <button onClick={() => { setLoading(true); setAttempt(a => a + 1) }} className="btn btn-solid w-full">{t('common.tryAgain')}</button>
        </div>
      </div>
    )
  }

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-6 py-5 border-b border-white/[0.06]">
        <Link href="/admin" className="min-w-0"><Logo /></Link>
        <span className="adm-badge ml-auto shrink-0">{t('admin.badge')}</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {navItems.map(item => {
          const [path, query] = item.href.split('?')
          const type = search.get('type')
          const isActive = item.href === '/admin' ? pathname === '/admin'
            : query ? pathname === path && `type=${type}` === query
            : path === '/admin/transactions' ? pathname === path && !type
            : pathname.startsWith(path)
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={`cc-navbtn relative flex items-center gap-3 px-3 min-h-10 py-1.5 rounded-lg text-[14px] transition-colors ${isActive ? 'nav-item-on font-medium' : 'nav-item'}`}
            >
              <span className="cc-navicon" aria-hidden="true"><item.icon width={16} height={16} /></span>
              <span className="truncate">{t(item.label)}</span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/35 flex items-center justify-center text-[13px] font-semibold shrink-0 text-accent">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{adminName}</p>
            <p className="text-[11px] text-accent">{t('admin.administrator')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <LanguageSelector align="left" direction="up" />
          <ThemeSelector align="left" direction="up" />
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-slate-400 hover:text-red-400 transition-colors px-3 min-h-11 rounded-lg hover:bg-red-500/5"
        >
          {t('common.signOut')}
        </button>
      </div>
    </>
  )

  return (
    <div className="cc-app adm min-h-screen bg-ink-950 text-white flex">
      {/* Desktop sidebar */}
      <aside className="cc-drawer hidden lg:flex w-64 shrink-0 flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside className={`cc-drawer lg:hidden fixed top-0 left-0 h-[100dvh] w-72 z-50 bg-ink-900 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0 drawer-shadow' : '-translate-x-full'}`}>
        <div className="flex items-center justify-end px-4 pt-4">
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            aria-label={t('common.closeMenu')}
          >
            ✕
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-30 glass-bar flex items-center gap-3 px-4 h-16 border-b border-white/[0.06]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            aria-label={t('common.openMenu')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/>
              <rect y="9" width="20" height="2" rx="1"/>
              <rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
          <Link href="/admin" className="min-w-0"><Logo /></Link>
          <span className="adm-badge ml-auto">{t('admin.badge')}</span>
          <button onClick={handleSignOut} className="h-9 px-3 rounded-lg text-xs text-slate-300 border border-white/[0.08] hover:text-red-400 hover:border-red-500/30 transition-colors">
            {t('common.signOut')}
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {(title || subtitle) && (
              <PageIntro className="mb-6" title={title || ''} sub={subtitle} icon={current ? <current.icon width={20} height={20} /> : undefined} />
            )}
            <ErrorBoundary label={t('admin.panel')}>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

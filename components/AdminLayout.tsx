'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

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

  const navItems: { label: TKey; icon: string; href: string }[] = [
    { label: 'admin.nav.dashboard', icon: '◈', href: '/admin' },
    { label: 'admin.nav.clients', icon: '◉', href: '/admin/clients' },
    { label: 'admin.nav.transactions', icon: '⇄', href: '/admin/transactions' },
    { label: 'admin.nav.deposits', icon: '↓', href: '/admin/transactions?type=deposit' },
    { label: 'admin.nav.withdrawals', icon: '↑', href: '/admin/transactions?type=withdrawal' },
    { label: 'admin.nav.verification', icon: '☑', href: '/admin/verification' },
    { label: 'admin.nav.investments', icon: '◆', href: '/admin/investments' },
    { label: 'admin.nav.wallets', icon: '▣', href: '/admin/wallets' },
    { label: 'admin.nav.transfers', icon: '⇣', href: '/admin/transfers' },
    { label: 'admin.nav.fees', icon: '%', href: '/admin/fees' },
    { label: 'admin.nav.reconciliation', icon: '≡', href: '/admin/reconciliation' },
    { label: 'admin.nav.assets', icon: '◐', href: '/admin/assets' },
    { label: 'admin.nav.automations', icon: '⚡', href: '/admin/automations' },
    { label: 'admin.nav.premium', icon: '★', href: '/admin/premium' },
    { label: 'admin.nav.payments', icon: '₦', href: '/admin/payments' },
    { label: 'admin.nav.features', icon: '⚑', href: '/admin/features' },
    { label: 'admin.nav.notifications', icon: '✉', href: '/admin/notifications' },
    { label: 'admin.nav.auditLogs', icon: '⊡', href: '/admin/audit-logs' },
    { label: 'admin.nav.settings', icon: '⚙', href: '/admin/settings' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (checkFailed) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
          <p className="text-white font-medium mb-1">{t('admin.verifyFailed')}</p>
          <p className="text-sm text-fg-muted mb-5">{t('admin.verifyFailedBody')}</p>
          <button onClick={() => { setLoading(true); setAttempt(a => a + 1) }} className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[#fff] text-sm font-medium">{t('common.tryAgain')}</button>
        </div>
      </div>
    )
  }

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-6 py-5 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold shrink-0 text-[#fff]">₿</div>
        <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
        <span className="ml-auto text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded font-medium shrink-0">{t('admin.badge')}</span>
      </div>

      <nav className="flex flex-col gap-1 p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${isActive ? 'nav-item-on font-medium' : 'nav-item'}`}
            >
              <span className={`text-base ${isActive ? 'text-brand-300' : ''}`} aria-hidden="true">{item.icon}</span>
              {t(item.label)}
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold shrink-0 text-[#fff]">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{adminName}</p>
            <p className="text-[10px] text-violet-400">{t('admin.administrator')}</p>
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
    <div className="min-h-screen bg-ink-950 text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-white/[0.06] flex-col sticky top-0 h-screen">
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
      <aside className={`lg:hidden fixed top-0 left-0 h-[100dvh] w-72 z-50 bg-ink-900 border-r border-white/[0.08] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
        <header className="lg:hidden flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold text-[#fff]">₿</div>
            <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
          </div>
          <span className="ml-auto text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded font-medium">{t('admin.badge')}</span>
          <button onClick={handleSignOut} className="h-9 px-3 rounded-lg text-xs text-slate-300 border border-white/[0.08] hover:text-red-400 hover:border-red-500/30 transition-colors">
            {t('common.signOut')}
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {(title || subtitle) && (
              <div className="mb-6">
                {title && <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{title}</h1>}
                {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
              </div>
            )}
            <ErrorBoundary label={t('admin.panel')}>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

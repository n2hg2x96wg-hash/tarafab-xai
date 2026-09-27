'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Props = {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export default function AdminLayout({ children, title, subtitle }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/admin/login'); return }
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('role, full_name').eq('id', user.id).single() as { data: { role?: string; full_name?: string } | null }
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      setAdminName(profile?.full_name || 'Admin')
      setLoading(false)
    }
    check()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const navItems = [
    { label: 'Dashboard', icon: '◈', href: '/admin' },
    { label: 'Clients', icon: '◉', href: '/admin/clients' },
    { label: 'Transactions', icon: '⇄', href: '/admin/transactions' },
    { label: 'Audit Logs', icon: '⊡', href: '/admin/audit-logs' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    )
  }

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-6 py-5 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold shrink-0">₿</div>
        <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
        <span className="ml-auto text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded font-medium shrink-0">ADMIN</span>
      </div>

      <nav className="flex flex-col gap-1 p-4 flex-1">
        {navItems.map(item => {
          const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${isActive ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold shrink-0">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{adminName}</p>
            <p className="text-[10px] text-violet-400">Administrator</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/5"
        >
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[#080810] text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-white/[0.06] flex-col">
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
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-72 z-50 bg-[#0d0d1a] border-r border-white/[0.08] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-end px-4 pt-4">
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            aria-label="Close menu"
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
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/>
              <rect y="9" width="20" height="2" rx="1"/>
              <rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">₿</div>
            <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
          </div>
          <span className="ml-auto text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {(title || subtitle) && (
              <div className="mb-6">
                {title && <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{title}</h1>}
                {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

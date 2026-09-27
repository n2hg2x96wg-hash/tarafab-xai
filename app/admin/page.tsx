'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Client = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  created_at: string
  accounts: {
    account_balance: number
    available_balance: number
    invested_balance: number
    pending_balance: number
  } | null
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adminName, setAdminName] = useState('')

  useEffect(() => {
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }
    const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single() as { data: { role?: string; full_name?: string } | null }
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }
    setAdminName(profile?.full_name || 'Admin')
    fetchClients()
  }

  const fetchClients = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at, accounts(account_balance, available_balance, invested_balance, pending_balance)')
      .order('created_at', { ascending: false }) as { data: Client[] | null }
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    (c.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (c.id?.toLowerCase() || '').includes(search.toLowerCase())
  )

  const totalAUM = clients.reduce((sum, c) => sum + (c.accounts?.account_balance || 0), 0)
  const totalClients = clients.filter(c => c.role === 'customer').length

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/[0.06] flex flex-col p-6 gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold">₿</div>
          <span className="font-bold text-white text-sm">Tarafab<span className="text-violet-400">.XAi</span></span>
          <span className="ml-auto text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {[
            { label: 'Dashboard', icon: '◈', href: '/admin', active: true },
            { label: 'Clients', icon: '◉', href: '/admin', active: false },
            { label: 'Transactions', icon: '⇄', href: '/admin', active: false },
            { label: 'Audit Logs', icon: '⊡', href: '/admin', active: false },
          ].map(item => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${item.active ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-white">{adminName}</p>
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
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm">Manage client accounts and balances</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Total Clients', value: totalClients.toString(), sub: 'registered users' },
              { label: 'Assets Under Management', value: `$${totalAUM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'total account balances' },
              { label: 'Active Accounts', value: clients.filter(c => c.role === 'customer' && c.accounts).length.toString(), sub: 'with account records' },
            ].map(stat => (
              <div key={stat.label} className="glass rounded-2xl p-5 border border-white/[0.08]">
                <p className="text-slate-400 text-xs mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-slate-600 text-xs mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Search + Table */}
          <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-white">All Clients</h2>
              <input
                type="text"
                placeholder="Search by name or ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field w-64 text-xs py-2"
              />
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading clients…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No clients found</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-white/[0.06]">
                    {['Name / ID', 'Role', 'Account Balance', 'Available', 'Invested', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-3 text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => (
                    <tr key={client.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{client.full_name || 'Unnamed'}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{client.id.slice(0, 16)}…</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${client.role === 'admin' ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' : 'bg-slate-800 text-slate-400 border border-white/[0.06]'}`}>
                          {client.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-white font-medium">
                        {client.accounts ? `$${(client.accounts.account_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">
                        {client.accounts ? `$${(client.accounts.available_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">
                        {client.accounts ? `$${(client.accounts.invested_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-600/10"
                        >
                          Edit Balance
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

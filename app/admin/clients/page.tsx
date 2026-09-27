'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'

type Client = {
  id: string
  full_name: string | null
  role: string
  created_at: string
  accounts: {
    account_balance: number
    available_balance: number
    invested_balance: number
    pending_balance: number
    profit_balance: number
  } | null
}

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'customer' | 'admin'>('customer')

  useEffect(() => {
    const fetch = async () => {
      const { data } = await (supabase.from('profiles') as any)
        .select('id, full_name, role, created_at, accounts(account_balance, available_balance, invested_balance, pending_balance, profit_balance)')
        .order('created_at', { ascending: false }) as { data: Client[] | null }
      setClients(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = clients.filter(c => {
    const matchRole = filter === 'all' || c.role === filter
    const matchSearch = !search ||
      (c.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  return (
    <AdminLayout title="Clients" subtitle="View and manage all registered users">
      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field text-xs py-2 flex-1"
          />
          <div className="flex gap-2">
            {(['all', 'customer', 'admin'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30' : 'text-slate-500 border border-white/[0.06] hover:text-white hover:border-white/20'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No clients found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Name / ID', 'Role', 'Account Balance', 'Available', 'Profit', 'Invested', 'Pending', 'Joined', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => (
                    <tr key={client.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{client.full_name || 'Unnamed'}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{client.id.slice(0, 16)}…</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium border ${client.role === 'admin' ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
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
                        {client.accounts ? `$${(client.accounts.profit_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">
                        {client.accounts ? `$${(client.accounts.invested_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">
                        {client.accounts ? `$${(client.accounts.pending_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-600/10 whitespace-nowrap"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-white/[0.04]">
              {filtered.map(client => (
                <div key={client.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-blue-500/40 flex items-center justify-center text-sm font-bold shrink-0">
                      {(client.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{client.full_name || 'Unnamed'}</p>
                      <p className="text-[10px] text-slate-600 font-mono">{client.id.slice(0, 20)}…</p>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-medium border shrink-0 ${client.role === 'admin' ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                      {client.role}
                    </span>
                  </div>
                  {client.accounts && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[
                        { label: 'Account', value: client.accounts.account_balance },
                        { label: 'Available', value: client.accounts.available_balance },
                        { label: 'Profit', value: client.accounts.profit_balance },
                        { label: 'Invested', value: client.accounts.invested_balance },
                        { label: 'Pending', value: client.accounts.pending_balance },
                      ].map(item => (
                        <div key={item.label} className="bg-white/[0.02] rounded-lg p-2">
                          <p className="text-[10px] text-slate-600">{item.label}</p>
                          <p className="text-xs font-semibold text-white">${(item.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="w-full text-center text-xs text-violet-400 border border-violet-500/30 px-3 py-2 rounded-lg hover:bg-violet-600/10 transition-colors block"
                  >
                    Manage Client →
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.06] text-xs text-slate-600">
            Showing {filtered.length} of {clients.length} profiles
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'

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
  } | null
}

type Stats = { total_customers: number; total_account_usd: number; total_available_usd: number; customers_with_accounts: number }
type Recon = { user_id: string; full_name: string | null; check_name: string; expected: number; actual: number; difference: number }
const RECON_LABEL: Record<string, string> = {
  total_vs_parts: 'Account total differs from the sum of its balances',
  negative_balance: 'A stored balance is negative',
  pending_investments_not_held: 'Pending investment requests exceed the held balance',
  active_investments_not_invested: 'Active investments exceed the invested balance',
}

// Totals come from the database (admin_stats) and the list is a small,
// server-filtered page, so the dashboard stays fast however many clients exist.
export default function AdminPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [recon, setRecon] = useState<Recon[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')

  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  // Debounced: one query after typing pauses, not one per keystroke.
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])

  useEffect(() => {
    supabase.rpc('admin_stats').then(({ data, error }) => { if (!error && data) setStats(data as Stats) })
    supabase.rpc('admin_reconciliation').then(({ data, error }) => setRecon(error ? null : (data as Recon[]) || []))
  }, [supabase, reload])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      let q = (supabase.from('profiles') as any)
        .select('id, full_name, role, created_at, accounts(account_balance, available_balance, invested_balance, pending_balance)')
        .eq('role', 'customer').order('created_at', { ascending: false }).limit(term ? 25 : 5)
      if (term) {
        const safe = term.replace(/[%_,()]/g, '')
        q = /^[0-9a-f-]{36}$/i.test(term) ? q.eq('id', term) : q.ilike('full_name', `%${safe}%`)
      }
      const { data, error } = await q as { data: Client[] | null; error: unknown }
      if (!alive) return
      // A failed load keeps the previous list rather than showing zero clients.
      if (error) setLoadError('Client data could not be loaded. Figures below may be incomplete.')
      else { setClients(data || []); setLoadError('') }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [supabase, term, reload])

  const filtered = clients
  const recentClients = clients
  // Sum of the clients' Account Balances (spendable). The legacy recorded total
  // (total_account_usd) is no longer kept in step with adjustments.
  const totalAUM = Number(stats?.total_available_usd || 0)
  const customers = { length: Number(stats?.total_customers || 0) }
  const activeAccounts = Number(stats?.customers_with_accounts || 0)

  return (
    <AdminLayout title="Admin Dashboard" subtitle="Manage client accounts and platform activity">
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      {recon && recon.length > 0 && (
        <div role="alert" className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/[0.06] p-4">
          <p className="text-sm font-semibold text-yellow-300">Reconciliation: {recon.length} item{recon.length === 1 ? '' : 's'} need review</p>
          <p className="text-xs text-slate-400 mt-1">Stored figures that do not agree. Nothing has been changed automatically; investigate and correct through an audited adjustment if needed.</p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {recon.map((r, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 text-slate-300">
                <Link href={`/admin/clients/${r.user_id}`} className="text-violet-300 hover:underline">{r.full_name || r.user_id.slice(0, 8)}</Link>
                <span>· {RECON_LABEL[r.check_name] || r.check_name}</span>
                <span className="text-slate-500 tabular-nums">expected ${Number(r.expected).toFixed(2)}, stored ${Number(r.actual).toFixed(2)} (difference {Number(r.difference).toFixed(2)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Clients', value: customers.length.toString(), sub: 'registered users', icon: '◉' },
          { label: 'Client Account Balances', value: `$${totalAUM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'total spendable balances', icon: '◈' },
          { label: 'Active Accounts', value: activeAccounts.toString(), sub: 'with account records', icon: '⇄' },
        ].map(stat => (
          <div key={stat.label} className="glass rounded-2xl p-5 border border-white/[0.08]">
            <div className="flex items-start justify-between mb-3">
              <p className="text-slate-400 text-xs">{stat.label}</p>
              <span className="text-violet-400 text-lg">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats ? stat.value : '—'}</p>
            <p className="text-slate-600 text-xs mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'View All Clients', href: '/admin/clients', color: 'violet' },
          { label: 'Transactions', href: '/admin/transactions', color: 'blue' },
          { label: 'Audit Logs', href: '/admin/audit-logs', color: 'slate' },
          { label: 'Market Data Health', href: '/admin/market-data', color: 'blue' },
          { label: 'Automation Center', href: '/admin/automations', color: 'violet' },
          { label: 'Admin Login', href: '/admin/login', color: 'slate' },
        ].map(link => (
          <Link
            key={link.label}
            href={link.href}
            className="glass rounded-xl p-4 border border-white/[0.08] hover:border-violet-500/30 hover:bg-violet-600/5 transition-all text-sm font-medium text-slate-300 hover:text-white text-center"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Recent clients */}
      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Clients</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field text-xs py-2 w-full sm:w-48"
            />
            <Link href="/admin/clients" className="text-xs text-violet-400 hover:text-violet-300 whitespace-nowrap transition-colors">
              View all →
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : (search ? filtered : recentClients).length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No clients found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Name / ID', 'Account Balance', 'Invested', 'Joined', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(search ? filtered : recentClients).map((client, i) => (
                    <tr key={client.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{client.full_name || 'Unnamed'}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{client.id.slice(0, 16)}…</p>
                      </td>
                      {/* Account Balance = the client's spendable (available) balance, as the client sees it. */}
                      <td className="px-5 py-4 text-sm text-white font-medium">
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
              {(search ? filtered : recentClients).map(client => (
                <div key={client.id} className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600/40 to-blue-500/40 flex items-center justify-center text-sm font-bold shrink-0">
                    {(client.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{client.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-slate-500">
                      {client.accounts ? `$${(client.accounts.available_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'No account'}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="text-xs text-violet-400 border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-600/10 transition-colors shrink-0"
                  >
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

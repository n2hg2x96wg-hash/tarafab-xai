'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'

type Tx = {
  id: string
  user_id: string
  type: string
  method: string | null
  amount: number
  fee: number | null
  status: string
  notes: string | null
  created_at: string
  profiles: { full_name: string | null } | null
}

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pending_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pending_verification: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  pending_blockchain_confirmation: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    const fetch = async () => {
      const { data } = await (supabase.from('transactions') as any)
        .select('id, user_id, type, method, amount, fee, status, notes, created_at, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(200) as { data: Tx[] | null }
      setTxs(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = txs.filter(tx => {
    const name = tx.profiles?.full_name?.toLowerCase() || ''
    const matchSearch = !search || name.includes(search.toLowerCase()) || tx.id.toLowerCase().includes(search.toLowerCase()) || tx.user_id.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || tx.status === filterStatus
    const matchType = !filterType || tx.type === filterType
    return matchSearch && matchStatus && matchType
  })

  const allStatuses = Array.from(new Set(txs.map(t => t.status))).sort()
  const allTypes = Array.from(new Set(txs.map(t => t.type))).sort()

  return (
    <AdminLayout title="Transactions" subtitle="All platform transactions">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field text-xs py-2 flex-1"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-2 sm:w-48">
          <option value="">All statuses</option>
          {allStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field text-xs py-2 sm:w-48">
          <option value="">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No transactions found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Client', 'Type', 'Amount', 'Fee', 'Status', 'Notes', 'Date'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx, i) => (
                    <tr key={tx.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{tx.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-600 font-mono">{tx.user_id.slice(0, 12)}…</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-300 capitalize">{tx.type.replace(/_/g, ' ')}</span>
                        {tx.method && <p className="text-[10px] text-slate-600 mt-0.5">{tx.method}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-white">
                        ${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {tx.fee ? `$${tx.fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                          {tx.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 max-w-[160px] truncate">{tx.notes || '—'}</td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-white/[0.04]">
              {filtered.map(tx => (
                <div key={tx.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{tx.profiles?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500 capitalize">{tx.type.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                        {tx.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  {tx.notes && <p className="text-xs text-slate-500 truncate">{tx.notes}</p>}
                  <p className="text-[10px] text-slate-600 mt-1">
                    {new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && (
          <div className="px-5 py-3 border-t border-white/[0.06] text-xs text-slate-600">
            Showing {filtered.length} of {txs.length} transactions
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

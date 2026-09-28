'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson, RequestError } from '@/lib/authFetch'

type Tx = {
  id: string
  user_id: string
  type: string
  method: string | null
  amount: number
  fee: number | null
  status: string
  notes: string | null
  reference: string | null
  address: string | null
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
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  const fetchTxs = async () => {
    const { data, error } = await (supabase.from('transactions') as any)
      .select('id, user_id, type, method, amount, fee, status, notes, reference, address, created_at, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200) as { data: Tx[] | null; error: unknown }
    if (error) setLoadError('Transactions could not be loaded. The list may be out of date.')
    else { setTxs(data || []); setLoadError('') }
    setLoading(false)
  }

  useEffect(() => { fetchTxs() }, [reload])

  const handleReview = async () => {
    if (!reviewingId || !reviewAction) return
    setReviewLoading(true)
    setReviewError('')
    try {
      // The database only reviews a transaction that is still pending, so a
      // second click, a retry or another admin acting first cannot apply it twice.
      await readJson(await authFetch('/api/admin/review-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: reviewingId, action: reviewAction, reason: reviewReason.trim() || undefined }),
      }))
      setReviewingId(null)
      setReviewAction(null)
      setReviewReason('')
      fetchTxs()
    } catch (err) {
      setReviewError(errorText(err))
      // Someone may have reviewed it already; show the current state.
      if (err instanceof RequestError && err.status !== 0) fetchTxs()
    } finally {
      setReviewLoading(false)
    }
  }

  const isPending = (status: string) => ['pending_review', 'pending', 'requested', 'under_review'].includes(status)
  const canReview = (tx: Tx) => isPending(tx.status) && (tx.type === 'deposit' || tx.type === 'withdrawal')
  const reviewingTx = txs.find(t => t.id === reviewingId)
  const reviewNoun = reviewingTx?.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'
  const receiptPath = (notes: string | null) => notes?.match(/receipt:([0-9a-f-]{36}\/[\w.-]+)/i)?.[1] || null
  const [receiptError, setReceiptError] = useState('')

  const openReceipt = async (path: string) => {
    setReceiptError('')
    const win = window.open('', '_blank')
    try {
      const data = await readJson<{ url: string }>(await authFetch(`/api/admin/receipt-url?path=${encodeURIComponent(path)}`))
      if (win) win.location.href = data.url
      else window.location.href = data.url
    } catch (e) {
      win?.close()
      setReceiptError(errorText(e))
    }
  }

  const sourceLabel = (tx: Tx) => tx.type === 'withdrawal' ? (tx.method === 'profit_balance' ? 'From profit balance' : 'From available balance') : tx.method

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
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      {/* Review Modal */}
      {reviewingId && reviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => { setReviewingId(null); setReviewAction(null) }}>
          <div className="glass rounded-2xl p-6 border border-white/[0.08] max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">
              {reviewAction === 'approve' ? `Approve ${reviewNoun}` : `Reject ${reviewNoun}`}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              {reviewingTx?.type === 'withdrawal'
                ? reviewAction === 'approve'
                  ? `This deducts $${Number(reviewingTx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} from the client's ${reviewingTx.method === 'profit_balance' ? 'profit' : 'available'} balance. Send the Bitcoin to ${reviewingTx.address || 'their address'} yourself.`
                  : 'This declines the withdrawal. Nothing is deducted from the client\'s balance.'
                : reviewAction === 'approve'
                  ? 'This will mark the deposit as completed and credit the client\'s balance.'
                  : 'This will reject the deposit. The client\'s balance will not change.'}
            </p>
            {reviewError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{reviewError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Reason (optional)</label>
              <textarea
                value={reviewReason} onChange={e => setReviewReason(e.target.value)}
                placeholder={reviewAction === 'approve' ? 'e.g. Receipt verified' : 'e.g. Invalid receipt'}
                rows={3} className="input-field resize-none text-sm" disabled={reviewLoading}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setReviewingId(null); setReviewAction(null) }} className="flex-1 py-2.5 text-sm font-medium text-slate-300 border border-white/[0.1] rounded-xl hover:bg-white/[0.04] transition-all" disabled={reviewLoading}>
                Cancel
              </button>
              <button onClick={handleReview} disabled={reviewLoading}
                className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-all flex items-center justify-center gap-2 ${
                  reviewAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                } disabled:opacity-50`}
              >
                {reviewLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {reviewAction === 'approve' ? (reviewingTx?.type === 'withdrawal' ? 'Approve & Deduct' : 'Approve & Credit') : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{receiptError}</div>
      )}

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
                    {['Client', 'Type', 'Amount', 'Fee', 'Status', 'Notes', 'Date', 'Actions'].map(h => (
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
                        {tx.method && <p className="text-[10px] text-slate-600 mt-0.5">{sourceLabel(tx)}</p>}
                        {tx.address && <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all max-w-[180px] select-all">{tx.address}</p>}
                        {receiptPath(tx.notes) && (
                          <button onClick={() => openReceipt(receiptPath(tx.notes)!)} className="mt-1 text-[10px] font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2">View receipt</button>
                        )}
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
                      <td className="px-5 py-4">
                        {canReview(tx) ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => { setReviewingId(tx.id); setReviewAction('approve'); setReviewError('') }}
                              className="px-2.5 py-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all">
                              Approve
                            </button>
                            <button onClick={() => { setReviewingId(tx.id); setReviewAction('reject'); setReviewError('') }}
                              className="px-2.5 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">—</span>
                        )}
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
                  {tx.method && <p className="text-[11px] text-slate-500">{sourceLabel(tx)}</p>}
                  {tx.address && <p className="text-[11px] text-slate-400 font-mono break-all select-all">{tx.address}</p>}
                  {tx.notes && <p className="text-xs text-slate-500 truncate">{tx.notes}</p>}
                  {receiptPath(tx.notes) && (
                    <button onClick={() => openReceipt(receiptPath(tx.notes)!)} className="mt-1 text-xs font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2">View receipt</button>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1">
                    {new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {canReview(tx) && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setReviewingId(tx.id); setReviewAction('approve'); setReviewError('') }}
                        className="flex-1 py-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all">
                        Approve
                      </button>
                      <button onClick={() => { setReviewingId(tx.id); setReviewAction('reject'); setReviewError('') }}
                        className="flex-1 py-2 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all">
                        Reject
                      </button>
                    </div>
                  )}
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

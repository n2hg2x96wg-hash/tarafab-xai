'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson, RequestError } from '@/lib/authFetch'
import { EffectiveDateModal } from '@/components/admin/EffectiveDateModal'

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
  effective_at: string
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

const PAGE = 50
// Stored 'adjustment' (and any legacy 'return') rows are shown and filtered as
// Profit; the stored type is never rewritten. Transfers are unused, so they only
// appear if such rows ever exist.
const KNOWN_TYPES = ['deposit', 'withdrawal', 'profit', 'investment', 'fee']
const typeKey = (type: string) => (type === 'adjustment' || type === 'return' ? 'profit' : type)
const KNOWN_STATUSES = ['pending', 'pending_review', 'pending_verification', 'pending_blockchain_confirmation', 'requested', 'under_review', 'approved', 'processing', 'completed', 'rejected', 'failed', 'cancelled']

export default function TransactionsPage() {
  const supabase = createClient()
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const params = useSearchParams()
  // /admin/transactions?type=deposit (or withdrawal) opens pre-filtered.
  const typeParam = params.get('type')
  const [filterType, setFilterType] = useState(typeParam === 'deposit' || typeParam === 'withdrawal' ? typeParam : '')
  useEffect(() => { setFilterType(typeParam === 'deposit' || typeParam === 'withdrawal' ? typeParam : '') }, [typeParam])
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [dating, setDating] = useState<Tx | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [term, setTerm] = useState('')
  // Debounced so typing sends one query, not one per keystroke.
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])

  // Type, status and ID/reference search are applied by the database, then
  // results are paged newest-first, so older pending items are never hidden
  // behind a fixed row cap. Name search also narrows the loaded rows below.
  const fetchTxs = async (before?: string) => {
    let q = (supabase.from('transactions') as any)
      .select('id, user_id, type, method, amount, fee, status, notes, reference, address, created_at, effective_at, profiles(full_name)')
      .order('effective_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE + 1)
    if (filterType) q = q.eq('type', filterType)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (before) q = q.lt('effective_at', before)
    if (term && /^[0-9a-f-]{36}$/i.test(term)) q = q.or(`id.eq.${term},user_id.eq.${term}`)
    else if (term && /^[A-Za-z]{2,4}-[A-Za-z0-9-]+$/.test(term)) q = q.ilike('reference', `${term.replace(/[%_,()]/g, '')}%`)
    const { data, error } = await q as { data: Tx[] | null; error: unknown }
    if (error) setLoadError('Transactions could not be loaded. The list may be out of date.')
    else {
      const rows = data || []
      setHasMore(rows.length > PAGE)
      const page = rows.slice(0, PAGE)
      setTxs(prev => before ? [...prev, ...page.filter(r => !prev.some(x => x.id === r.id))] : page)
      setLoadError('')
    }
    setLoading(false)
  }
  const loadMore = async () => {
    const last = txs[txs.length - 1]?.effective_at || txs[txs.length - 1]?.created_at
    if (!last || loadingMore) return
    setLoadingMore(true)
    try { await fetchTxs(last) } finally { setLoadingMore(false) }
  }

  useEffect(() => { fetchTxs() }, [reload, filterType, filterStatus, term])

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
  // The stored note carries the receipt's file path for the viewer button;
  // the path itself is an internal detail, so it is not printed in the table.
  const noteText = (notes: string | null) =>
    (notes || '').replace(/receipt:[0-9a-f-]{36}\/[\w.-]+/i, '').replace(/\|\s*$/, '').replace(/^\s*\|/, '').trim()
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

  const sourceLabel = (tx: Tx) => tx.type === 'withdrawal' ? (tx.method === 'profit_balance' ? 'From profit balance' : 'From account balance') : tx.method

  const filtered = txs.filter(tx => {
    const name = tx.profiles?.full_name?.toLowerCase() || ''
    const s = search.toLowerCase()
    const matchSearch = !search || name.includes(s) || tx.id.toLowerCase().includes(s) || tx.user_id.toLowerCase().includes(s) || (tx.reference || '').toLowerCase().includes(s)
    const matchStatus = !filterStatus || tx.status === filterStatus
    const matchType = !filterType || typeKey(tx.type) === filterType
    return matchSearch && matchStatus && matchType
  })

  const allStatuses = Array.from(new Set([...KNOWN_STATUSES, ...txs.map(t => t.status), ...(filterStatus ? [filterStatus] : [])])).sort()
  const allTypes = Array.from(new Set([...KNOWN_TYPES, ...txs.map(t => typeKey(t.type)), ...(filterType ? [filterType] : [])])).sort()

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
                className={`flex-1 py-2.5 text-sm font-semibold text-[#fff] rounded-xl transition-all flex items-center justify-center gap-2 ${
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
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-2 sm:w-48 capitalize">
          <option value="">All statuses</option>
          {allStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field text-xs py-2 sm:w-48 capitalize">
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
                        <p className="text-sm font-medium text-white whitespace-nowrap">{tx.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-600 font-mono">{tx.user_id.slice(0, 12)}…</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-300 capitalize">{typeKey(tx.type).replace(/_/g, ' ')}</span>
                        {tx.method && <p className="text-[10px] text-slate-600 mt-0.5">{sourceLabel(tx)}</p>}
                        {tx.address && <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all max-w-[180px] select-all">{tx.address}</p>}
                        {receiptPath(tx.notes) && (
                          <button onClick={() => openReceipt(receiptPath(tx.notes)!)} className="mt-1 text-[10px] font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2 whitespace-nowrap">View receipt</button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-white">
                        ${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {tx.fee ? `$${tx.fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block whitespace-nowrap text-[10px] px-2 py-1 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                          {tx.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 max-w-[180px]">
                        {tx.reference && <span className="block font-mono text-[11px] text-slate-400">{tx.reference}</span>}
                        <span className="block truncate" title={noteText(tx.notes)}>{noteText(tx.notes) || '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        <span className="block text-slate-300">{new Date(tx.effective_at || tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        {tx.effective_at && tx.effective_at !== tx.created_at && <span className="block text-[10px] text-slate-600" title="Internal recording time">recorded {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                        <button onClick={() => setDating({ ...tx, effective_at: tx.effective_at || tx.created_at })} className="text-[10px] text-violet-300 hover:text-violet-200">Change date</button>
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
                      <p className="text-xs text-slate-500 capitalize">{typeKey(tx.type).replace(/_/g, ' ')}</p>
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
                  {tx.reference && <p className="text-xs font-mono text-slate-400">{tx.reference}</p>}
                  {noteText(tx.notes) && <p className="text-xs text-slate-500 truncate">{noteText(tx.notes)}</p>}
                  {receiptPath(tx.notes) && (
                    <button onClick={() => openReceipt(receiptPath(tx.notes)!)} className="mt-1 text-xs font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2">View receipt</button>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">
                    {new Date(tx.effective_at || tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {tx.effective_at && tx.effective_at !== tx.created_at && <span className="text-slate-600"> · recorded {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    {' · '}<button onClick={() => setDating({ ...tx, effective_at: tx.effective_at || tx.created_at })} className="text-violet-300 hover:text-violet-200">Change date</button>
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
            <div className="flex items-center justify-between gap-3">
              <span>Showing {filtered.length} of {txs.length} loaded{hasMore ? '' : ' (all matching)'}</span>
              {hasMore && <button onClick={loadMore} disabled={loadingMore} className="btn btn-sm btn-outline">{loadingMore ? 'Loading…' : 'Load more'}</button>}
            </div>
          </div>
        )}
      </div>
      {dating && <EffectiveDateModal tx={dating} onClose={() => setDating(null)} onSaved={() => { setDating(null); setReload(n => n + 1) }} />}
    </AdminLayout>
  )
}

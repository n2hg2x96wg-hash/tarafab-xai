'use client'

import { useEffect, useState } from 'react'
import { adminTxLabel, isAccountCredit, txCategory, type TxCategory } from '@/lib/txCategory'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson, RequestError } from '@/lib/authFetch'
import { EffectiveDateModal } from '@/components/admin/EffectiveDateModal'
import { BankReviewPanel } from '@/components/admin/BankReviewPanel'
import { AppScreen } from '@/components/AppScreen'
import { BackCloseLayer } from '@/lib/backClose'

type Tx = {
  id: string
  user_id: string
  type: string
  direction?: string | null
  source?: string | null
  method: string | null
  amount: number
  fee: number | null
  status: string
  notes: string | null
  reference: string | null
  address: string | null
  bank_account_id?: string | null
  tx_hash?: string | null
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
// Shown and filtered by what each transaction means (lib/txCategory, from the
// database-set `source`), in admin wording: what the administrator or the
// client actually did. An admin top-up is an Account Credit (the client sees
// Deposit · Account credit), an admin debit is an Account Debit, only
// investment returns are Profit. Stored types and amounts are never rewritten.
type AdminKey = TxCategory | 'account_credit'
const KNOWN_TYPES: AdminKey[] = ['account_credit', 'account_debit', 'deposit', 'withdrawal', 'fee', 'investment', 'profit', 'loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation', 'profit_adjustment', 'profit_distribution', 'profit_allocation', 'profit_debit', 'profit_payout', 'reversal', 'adjustment']
const CATEGORY_SOURCES: Partial<Record<AdminKey, string[]>> = {
  account_credit: ['admin_funding'], account_debit: ['admin_debit'], deposit: ['client_deposit'],
  profit: ['investment_profit'], profit_adjustment: ['profit_adjustment'], investment: ['investment_principal'],
  withdrawal: ['withdrawal'], fee: ['fee'], reversal: ['reversal'], adjustment: ['balance_adjustment'], transfer: ['transfer'],
  loyalty_reward: ['loyalty_reward'], promotional_credit: ['promotional_credit'], profit_correction: ['profit_correction'], reconciliation: ['reconciliation'],
  profit_distribution: ['profit_distribution'], profit_allocation: ['profit_allocation'],
  profit_debit: ['profit_debit'], profit_payout: ['profit_payout'],
}
const KEY_LABEL: Record<string, string> = {
  account_credit: 'Account Credit', account_debit: 'Account Debit', deposit: 'Deposit (client)', withdrawal: 'Withdrawal', fee: 'Fee',
  investment: 'Investment', profit: 'Profit (investment return)', profit_adjustment: 'Profit · Manual (no category)', reversal: 'Reversal', adjustment: 'Adjustment', transfer: 'Transfer',
  loyalty_reward: 'Profit · Loyalty Reward', promotional_credit: 'Profit · Promotional Credit', profit_correction: 'Profit Balance Correction', reconciliation: 'Account Reconciliation',
  profit_distribution: 'Profit Distribution · Manual', profit_allocation: 'Profit Credit · Manual',
  profit_debit: 'Profit Debit · Manual', profit_payout: 'Profit Payout · Manual',
}
const typeKey = (tx: Pick<Tx, 'type' | 'method' | 'direction' | 'source'>): AdminKey => isAccountCredit(tx) ? 'account_credit' : txCategory(tx)
const typeText = (tx: Pick<Tx, 'type' | 'method' | 'direction' | 'source'>) => adminTxLabel(tx)
const KNOWN_STATUSES = ['pending', 'pending_review', 'pending_verification', 'pending_blockchain_confirmation', 'requested', 'under_review', 'approved', 'processing', 'completed', 'rejected', 'failed', 'cancelled']

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-600" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
)

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
  // The transaction opened on its own screen (tap a row or card).
  const [openId, setOpenId] = useState<string | null>(null)
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
      .select('id, user_id, type, method, direction, source, amount, fee, status, notes, reference, address, bank_account_id, tx_hash, created_at, effective_at, profiles(full_name)')
      .order('effective_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE + 1)
    if (filterType) { const src = CATEGORY_SOURCES[filterType as AdminKey]; q = src ? q.in('source', src) : q.eq('type', filterType) }
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
    // A bank transfer is approved only once it has been sent: the bank's
    // payment reference is required (the database refuses it without one).
    if (reviewAction === 'approve' && reviewIsBank && !reviewReason.trim()) { setReviewError('Enter the bank payment reference of the transfer you sent.'); return }
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
  const openTx = openId ? txs.find(t => t.id === openId) || null : null
  const reviewNoun = reviewingTx?.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'
  const reviewIsBank = reviewingTx?.type === 'withdrawal' && !!reviewingTx.bank_account_id
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

  const sourceLabel = (tx: Tx) => tx.type === 'withdrawal' ? (tx.method === 'profit_balance' ? 'From profit balance' : 'From account balance') : tx.method?.replace(/_/g, ' ')

  const filtered = txs.filter(tx => {
    const name = tx.profiles?.full_name?.toLowerCase() || ''
    const s = search.toLowerCase()
    const matchSearch = !search || name.includes(s) || tx.id.toLowerCase().includes(s) || tx.user_id.toLowerCase().includes(s) || (tx.reference || '').toLowerCase().includes(s)
    const matchStatus = !filterStatus || tx.status === filterStatus
    const matchType = !filterType || typeKey(tx) === filterType
    return matchSearch && matchStatus && matchType
  })

  const allStatuses = Array.from(new Set([...KNOWN_STATUSES, ...txs.map(t => t.status), ...(filterStatus ? [filterStatus] : [])])).sort()
  const allTypes: string[] = Array.from(new Set<string>([...KNOWN_TYPES, ...txs.map(t => typeKey(t)), ...(filterType ? [filterType] : [])]))

  return (
    <AdminLayout title="Transactions" subtitle="All platform transactions">
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      {/* Review Modal */}
      {reviewingId && reviewAction && (
        // Above the transaction's own screen; full height on phones.
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:px-4" role="dialog" aria-modal="true" aria-label={reviewAction === 'approve' ? `Approve ${reviewNoun}` : `Reject ${reviewNoun}`}
          onClick={() => { if (!reviewLoading) { setReviewingId(null); setReviewAction(null) } }} data-tx-review>
          <BackCloseLayer onClose={() => { if (!reviewLoading) { setReviewingId(null); setReviewAction(null) } }} />
          <div className="glass rounded-t-2xl sm:rounded-2xl p-6 border border-white/[0.08] max-w-md w-full max-h-[90dvh] overflow-y-auto adm-sheet" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">
              {reviewAction === 'approve' ? `Approve ${reviewNoun}` : `Reject ${reviewNoun}`}{reviewIsBank ? ' · Bank transfer' : ''}
            </h3>
            {reviewIsBank && reviewingTx && (
              <p className="text-slate-500 text-xs mb-2" data-bank-review-ref>
                {reviewingTx.reference || reviewingTx.id} · {new Date(reviewingTx.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · client {reviewingTx.profiles?.full_name || reviewingTx.user_id.slice(0, 8)}
              </p>
            )}
            <p className="text-slate-400 text-sm mb-4">
              {reviewIsBank
                ? reviewAction === 'approve'
                  ? `Approve only after you have sent the bank transfer. This deducts $${Number(reviewingTx!.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} (USD) from the client's ${reviewingTx!.method === 'profit_balance' ? 'profit' : 'available'} balance and records your bank payment reference. The account must be verified first.`
                  : 'This declines the bank withdrawal. Nothing is deducted from the client\'s balance. The reason is shown in the audit log.'
                : reviewingTx?.type === 'withdrawal'
                ? reviewAction === 'approve'
                  ? `This deducts $${Number(reviewingTx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} from the client's ${reviewingTx.method === 'profit_balance' ? 'profit' : 'available'} balance. Send the Bitcoin to ${reviewingTx.address || 'their address'} yourself.`
                  : 'This declines the withdrawal. Nothing is deducted from the client\'s balance.'
                : reviewAction === 'approve'
                  ? 'This will mark the deposit as completed and credit the client\'s balance.'
                  : 'This will reject the deposit. The client\'s balance will not change.'}
            </p>
            {reviewIsBank && reviewingTx?.bank_account_id && <BankReviewPanel bankAccountId={reviewingTx.bank_account_id} userId={reviewingTx.user_id} />}
            {reviewError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{reviewError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="review-reason">
                {reviewIsBank ? (reviewAction === 'approve' ? 'Bank payment reference (required)' : 'Reason for rejection') : 'Reason (optional)'}
              </label>
              <textarea id="review-reason"
                value={reviewReason} onChange={e => setReviewReason(e.target.value)}
                placeholder={reviewIsBank ? (reviewAction === 'approve' ? 'Reference shown by your bank for the transfer you sent' : 'e.g. Account holder name does not match') : reviewAction === 'approve' ? 'e.g. Receipt verified' : 'e.g. Invalid receipt'}
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
                {reviewAction === 'approve' ? (reviewIsBank ? 'Transfer sent · Approve' : reviewingTx?.type === 'withdrawal' ? 'Approve & Deduct' : 'Approve & Credit') : 'Reject'}
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
          {allTypes.map(t => <option key={t} value={t}>{KEY_LABEL[t] || t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin mx-auto" />
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
                    <tr key={tx.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}
                      onClick={e => { if (!(e.target as HTMLElement).closest('button,a')) setOpenId(tx.id) }}
                      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenId(tx.id) } }}
                      tabIndex={0} aria-label={`${tx.profiles?.full_name || 'Unknown'} · ${typeText(tx)} · $${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} — open details`} data-admin-tx-row={tx.id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white whitespace-nowrap">{tx.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-600 font-mono">{tx.user_id.slice(0, 12)}…</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-300 capitalize" data-admin-tx-type={typeKey(tx)}>{typeText(tx)}</span>
                        {tx.method && <p className="text-[10px] text-slate-600 mt-0.5">{sourceLabel(tx)}</p>}
                        {tx.address && <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all max-w-[180px] select-all">{tx.address}</p>}
                        {tx.bank_account_id && tx.tx_hash && <p className="text-[10px] text-slate-500 mt-0.5 break-all max-w-[180px]" data-bank-ref>Bank ref: {tx.tx_hash}</p>}
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
                        <button onClick={() => setDating({ ...tx, effective_at: tx.effective_at || tx.created_at })} className="text-[10px] text-accent hover:text-accent-hover">Change date</button>
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
                  <button type="button" onClick={() => setOpenId(tx.id)} className="tap block w-full text-left -m-2 p-2 rounded-xl" data-admin-tx-open={tx.id}>
                    <span className="flex items-center justify-between gap-3 mb-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white truncate">{tx.profiles?.full_name || 'Unknown'}</span>
                        <span className="block text-xs text-slate-500 capitalize">{typeText(tx)}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-right">
                          <span className="block text-sm font-bold text-white">${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[tx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                            {tx.status.replace(/_/g, ' ')}
                          </span>
                        </span>
                        <Chevron />
                      </span>
                    </span>
                    {tx.method && <span className="block text-[11px] text-slate-500">{sourceLabel(tx)}</span>}
                    {tx.address && <span className="block text-[11px] text-slate-400 font-mono break-all">{tx.address}</span>}
                    {tx.bank_account_id && tx.tx_hash && <span className="block text-[11px] text-slate-500 break-all" data-bank-ref>Bank ref: {tx.tx_hash}</span>}
                    {tx.reference && <span className="block text-xs font-mono text-slate-400">{tx.reference}</span>}
                    {noteText(tx.notes) && <span className="block text-xs text-slate-500 truncate">{noteText(tx.notes)}</span>}
                    <span className="block text-[10px] text-slate-500 mt-1">
                      {new Date(tx.effective_at || tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {tx.effective_at && tx.effective_at !== tx.created_at && <span className="text-slate-600"> · recorded {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                      {receiptPath(tx.notes) && <span className="text-sky-400"> · receipt attached</span>}
                    </span>
                  </button>
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
      {openTx && (
        <AppScreen title="Transaction" onClose={() => setOpenId(null)} attrs={{ 'data-admin-tx-screen': openTx.id }}>
          <div className="px-5 sm:px-6 pt-5 pb-6">
            <p className="text-xs text-slate-500 capitalize">{typeText(openTx)}</p>
            <p className="mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em] text-white tabular-nums break-words">${(openTx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <span className={`mt-3 inline-block text-[11px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[openTx.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>{openTx.status.replace(/_/g, ' ')}</span>
            <dl className="mt-5 divide-y divide-white/[0.05] text-sm">
              {([
                ['Client', <Link key="c" href={`/admin/clients/${openTx.user_id}`} className="text-accent hover:text-accent-hover">{openTx.profiles?.full_name || 'Unknown'} →</Link>],
                ['Client ID', <span key="u" className="font-mono text-xs select-all break-all">{openTx.user_id}</span>],
                openTx.method ? ['Method', <span key="m" className="capitalize">{sourceLabel(openTx)}</span>] : null,
                openTx.fee ? ['Fee', `$${openTx.fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`] : null,
                openTx.address ? ['Address', <span key="a" className="font-mono text-xs select-all break-all">{openTx.address}</span>] : null,
                openTx.bank_account_id && openTx.tx_hash ? ['Bank ref', <span key="b" className="break-all">{openTx.tx_hash}</span>] : null,
                openTx.reference ? ['Reference', <span key="r" className="font-mono text-xs select-all break-all">{openTx.reference}</span>] : null,
                noteText(openTx.notes) ? ['Notes', <span key="n" className="break-words whitespace-pre-line">{noteText(openTx.notes)}</span>] : null,
                ['Effective date', new Date(openTx.effective_at || openTx.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })],
                openTx.effective_at && openTx.effective_at !== openTx.created_at ? ['Recorded', new Date(openTx.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })] : null,
                ['Transaction ID', <span key="i" className="font-mono text-xs select-all break-all">{openTx.id}</span>],
              ] as ([string, React.ReactNode] | null)[]).filter(Boolean).map(r => (
                <div key={r![0]} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5">
                  <dt className="text-slate-500">{r![0]}</dt><dd className="text-slate-200 min-w-0">{r![1]}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {receiptPath(openTx.notes) && <button onClick={() => openReceipt(receiptPath(openTx.notes)!)} className="btn btn-outline col-span-2" data-screen-receipt>View receipt</button>}
              <button onClick={() => setDating({ ...openTx, effective_at: openTx.effective_at || openTx.created_at })} className="btn btn-outline col-span-2">Change date</button>
              {canReview(openTx) && (
                <>
                  <button onClick={() => { setReviewingId(openTx.id); setReviewAction('approve'); setReviewError('') }} className="min-h-11 rounded-xl text-sm font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20" data-screen-approve>Approve</button>
                  <button onClick={() => { setReviewingId(openTx.id); setReviewAction('reject'); setReviewError('') }} className="min-h-11 rounded-xl text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20" data-screen-reject>Reject</button>
                </>
              )}
            </div>
            {receiptError && <p role="alert" className="mt-3 text-sm text-red-400">{receiptError}</p>}
          </div>
        </AppScreen>
      )}
      {dating && <EffectiveDateModal tx={dating} onClose={() => setDating(null)} onSaved={() => { setDating(null); setReload(n => n + 1) }} />}
    </AdminLayout>
  )
}

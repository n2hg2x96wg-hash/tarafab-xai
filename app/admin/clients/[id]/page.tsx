'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'

type Account = {
  id: string
  account_balance: number
  available_balance: number
  invested_balance: number
  pending_balance: number
  profit_balance: number
  trading_status: 'active' | 'inactive' | null
  trading_strategy_name: string | null
  trading_status_updated_at: string | null
}

type Profile = {
  id: string
  full_name: string | null
  role: string
  created_at: string
  account_status: string
  verification_status: string
}

type Transaction = {
  id: string
  type: string
  amount: number
  status: string
  notes: string | null
  created_at: string
}

type AdjustForm = {
  field: 'account_balance' | 'available_balance' | 'invested_balance' | 'pending_balance' | 'profit_balance'
  operation: 'credit' | 'debit' | 'set'
  amount: string
  reason: string
}

const FIELD_LABELS = {
  account_balance: 'Account Balance',
  available_balance: 'Available Balance',
  invested_balance: 'Invested Balance',
  pending_balance: 'Pending Balance',
  profit_balance: 'Profit Balance',
}

export default function ClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'adjust' | 'edit' | 'history'>('overview')
  const [editForm, setEditForm] = useState({ full_name: '', account_status: 'active', verification_status: 'unverified' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')

  const [tradingForm, setTradingForm] = useState({ trading_status: 'inactive', trading_strategy_name: '' })
  const [tradingSaving, setTradingSaving] = useState(false)
  const [tradingError, setTradingError] = useState('')
  const [tradingSuccess, setTradingSuccess] = useState('')

  const [adjustForm, setAdjustForm] = useState<AdjustForm>({
    field: 'account_balance',
    operation: 'credit',
    amount: '',
    reason: '',
  })
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState('')
  const [adjustSuccess, setAdjustSuccess] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    load()
  }, [clientId])

  const load = async () => {
    setLoading(true)
    const { data: profileData } = await (supabase.from('profiles') as any)
      .select('id, full_name, role, created_at, account_status, verification_status').eq('id', clientId).single() as { data: Profile | null }
    const { data: accountData } = await (supabase.from('accounts') as any)
      .select('*').eq('user_id', clientId).single() as { data: Account | null }
    const { data: txData } = await (supabase.from('transactions') as any)
      .select('id, type, amount, status, notes, created_at')
      .eq('user_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20) as { data: Transaction[] | null }

    setProfile(profileData)
    if (profileData) {
      setEditForm({
        full_name: profileData.full_name || '',
        account_status: profileData.account_status || 'active',
        verification_status: profileData.verification_status || 'unverified',
      })
    }
    setAccount(accountData)
    if (accountData) {
      setTradingForm({
        trading_status: accountData.trading_status || 'inactive',
        trading_strategy_name: accountData.trading_strategy_name || '',
      })
    }
    setTransactions(txData || [])
    setLoading(false)
  }

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditError('')
    setEditSuccess('')
    setEditSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ user_id: clientId, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error || 'Could not save changes'); return }
      setEditSuccess('Client details saved.')
      await load()
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleTradingSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setTradingError('')
    setTradingSuccess('')
    setTradingSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/set-trading-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({
          user_id: clientId,
          trading_status: tradingForm.trading_status,
          trading_strategy_name: tradingForm.trading_strategy_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setTradingError(data.error || 'Could not save trading status'); return }
      setTradingSuccess('Trading status saved.')
      await load()
    } catch {
      setTradingError('Network error. Please try again.')
    } finally {
      setTradingSaving(false)
    }
  }

  const computeNewValue = () => {
    if (!account) return null
    const current = account[adjustForm.field] || 0
    const amt = parseFloat(adjustForm.amount) || 0
    if (adjustForm.operation === 'credit') return current + amt
    if (adjustForm.operation === 'debit') return current - amt
    return amt
  }

  const handleAdjustSubmit = () => {
    setAdjustError('')
    setAdjustSuccess('')
    const amt = parseFloat(adjustForm.amount)
    if (!amt || amt <= 0) { setAdjustError('Amount must be greater than 0'); return }
    if (!adjustForm.reason.trim()) { setAdjustError('Reason is required'); return }
    const newVal = computeNewValue()
    if (newVal === null || newVal < 0) { setAdjustError('Resulting balance cannot be negative'); return }
    setShowConfirm(true)
  }

  const handleAdjustConfirm = async () => {
    setShowConfirm(false)
    setAdjusting(true)
    setAdjustError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/adjust-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          target_user_id: clientId,
          field: adjustForm.field,
          operation: adjustForm.operation,
          amount: parseFloat(adjustForm.amount),
          reason: adjustForm.reason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setAdjustError(data.error || 'Adjustment failed'); setAdjusting(false); return }

      setAdjustSuccess(`${FIELD_LABELS[adjustForm.field]} updated successfully.`)
      setAdjustForm({ field: 'account_balance', operation: 'credit', amount: '', reason: '' })
      await load()
    } catch {
      setAdjustError('Network error. Please try again.')
    } finally {
      setAdjusting(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  if (!profile) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-slate-400 text-sm mb-4">Client not found</p>
          <Link href="/admin/clients" className="text-violet-400 text-sm hover:text-violet-300">← Back to clients</Link>
        </div>
      </AdminLayout>
    )
  }

  const newVal = computeNewValue()

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6">
        <Link href="/admin" className="hover:text-violet-400 transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/clients" className="hover:text-violet-400 transition-colors">Clients</Link>
        <span>/</span>
        <span className="text-slate-300 truncate max-w-[120px]">{profile.full_name || profile.id.slice(0, 8)}</span>
      </nav>

      {/* Client header */}
      <div className="glass rounded-2xl p-5 border border-white/[0.08] mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-lg font-bold shrink-0">
            {(profile.full_name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white">{profile.full_name || 'Unnamed Client'}</h1>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5 break-all">{profile.id}</p>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-medium border shrink-0 ${profile.role === 'admin' ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
            {profile.role}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className={`text-[10px] px-2 py-1 rounded-md border capitalize ${profile.account_status === 'suspended' ? 'text-red-400 border-red-500/30' : 'text-emerald-400 border-emerald-500/30'}`}>{profile.account_status}</span>
          <span className="text-[10px] px-2 py-1 rounded-md border capitalize text-slate-300 border-white/[0.1]">{profile.verification_status}</span>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] w-fit">
        {(['overview', 'adjust', 'edit', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === t ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20' : 'text-slate-500 hover:text-white'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'adjust' ? 'Adjust Balance' : t === 'edit' ? 'Edit Details' : 'History'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div>
          {account ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              {[
                { label: 'Account Balance', value: account.account_balance },
                { label: 'Available', value: account.available_balance },
                { label: 'Invested', value: account.invested_balance },
                { label: 'Pending', value: account.pending_balance },
                { label: 'Profit', value: account.profit_balance },
              ].map(item => (
                <div key={item.label} className="glass rounded-xl p-4 border border-white/[0.08]">
                  <p className="text-[10px] text-slate-500 mb-1">{item.label}</p>
                  <p className="text-lg font-bold text-white">${(item.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-5 border border-white/[0.08] mb-5 text-sm text-slate-500">
              No account record found for this user.
            </div>
          )}
          <button
            onClick={() => setTab('adjust')}
            className="text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 px-6 py-3 rounded-xl hover:opacity-90 transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)]"
          >
            Adjust Balance →
          </button>
        </div>
      )}

      {/* Adjust tab */}
      {tab === 'adjust' && (
        <div className="glass rounded-2xl p-5 sm:p-6 border border-white/[0.08] max-w-lg">
          <h2 className="text-sm font-semibold text-white mb-1">Balance Adjustment</h2>
          <p className="text-xs text-slate-500 mb-5">All adjustments are logged to the audit trail with full details.</p>

          {adjustSuccess && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span><span>{adjustSuccess}</span>
            </div>
          )}
          {adjustError && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <span>⚠</span><span>{adjustError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Balance Field</label>
              <select
                value={adjustForm.field}
                onChange={e => setAdjustForm(f => ({ ...f, field: e.target.value as AdjustForm['field'] }))}
                className="input-field text-sm"
                disabled={adjusting}
              >
                {(Object.entries(FIELD_LABELS) as [AdjustForm['field'], string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Operation</label>
              <div className="flex gap-2">
                {(['credit', 'debit', 'set'] as const).map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => setAdjustForm(f => ({ ...f, operation: op }))}
                    disabled={adjusting}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border ${adjustForm.operation === op
                      ? op === 'credit' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : op === 'debit' ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : 'bg-violet-600/15 text-violet-300 border-violet-500/20'
                      : 'text-slate-500 border-white/[0.06] hover:text-white hover:border-white/20'}`}
                  >
                    {op === 'credit' ? '+ Credit' : op === 'debit' ? '− Debit' : '= Set'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={adjustForm.amount}
                  onChange={e => setAdjustForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="input-field pl-8"
                  disabled={adjusting}
                />
              </div>
              {account && adjustForm.amount && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Current: <span className="text-white">${(account[adjustForm.field] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  {' → '}
                  <span className={`font-medium ${(newVal ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {newVal !== null ? `$${newVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Reason / Notes</label>
              <textarea
                value={adjustForm.reason}
                onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Manual deposit correction, investment return, admin adjustment…"
                rows={3}
                className="input-field resize-none text-sm"
                disabled={adjusting}
              />
            </div>
          </div>

          <button
            onClick={handleAdjustSubmit}
            disabled={adjusting || !adjustForm.amount || !adjustForm.reason.trim()}
            className="w-full mt-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2"
          >
            {adjusting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
            ) : 'Review & Confirm'}
          </button>
        </div>
      )}

      {/* Edit tab */}
      {tab === 'edit' && (
        <form onSubmit={handleEditSave} className="glass rounded-2xl p-5 sm:p-6 border border-white/[0.08] max-w-lg space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Client Details</h2>
            <p className="text-xs text-slate-500">Changes are recorded in the audit log. Suspended clients cannot request withdrawals.</p>
          </div>
          {editSuccess && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{editSuccess}</div>}
          {editError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{editError}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
            <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} className="input-field text-sm" disabled={editSaving} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Account status</label>
              <select value={editForm.account_status} onChange={e => setEditForm(f => ({ ...f, account_status: e.target.value }))} className="input-field text-sm" disabled={editSaving}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Verification</label>
              <select value={editForm.verification_status} onChange={e => setEditForm(f => ({ ...f, verification_status: e.target.value }))} className="input-field text-sm" disabled={editSaving}>
                <option value="unverified">Unverified</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={editSaving} className="w-full py-3 text-sm font-semibold text-black bg-[#F7931A] hover:bg-[#FFA73D] rounded-xl disabled:opacity-50 transition-colors">
            {editSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Trading status (separate save — different backend field) */}
      {tab === 'edit' && (
        <form onSubmit={handleTradingSave} className="glass rounded-2xl p-5 sm:p-6 border border-white/[0.08] max-w-lg space-y-4 mt-5">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Trading Status</h2>
            <p className="text-xs text-slate-500">
              Controls the &ldquo;Trading Active / Inactive&rdquo; indicator this client sees on their dashboard. There is no automated trading engine yet — only turn this on if trading is genuinely happening on this account. Every change is recorded in the audit log.
            </p>
          </div>
          {tradingSuccess && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{tradingSuccess}</div>}
          {tradingError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{tradingError}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Status shown to client</label>
            <div className="flex gap-2">
              {(['inactive', 'active'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTradingForm(f => ({ ...f, trading_status: s }))}
                  disabled={tradingSaving}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border ${tradingForm.trading_status === s
                    ? s === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-700/40 text-slate-300 border-white/[0.1]'
                    : 'text-slate-500 border-white/[0.06] hover:text-white hover:border-white/20'}`}
                >
                  {s === 'active' ? 'Active' : 'Inactive'}
                </button>
              ))}
            </div>
          </div>
          {tradingForm.trading_status === 'active' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Strategy name (shown to client)</label>
              <input
                value={tradingForm.trading_strategy_name}
                onChange={e => setTradingForm(f => ({ ...f, trading_strategy_name: e.target.value }))}
                placeholder="e.g. Momentum Scanner"
                className="input-field text-sm"
                disabled={tradingSaving}
              />
            </div>
          )}
          {account?.trading_status_updated_at && (
            <p className="text-xs text-slate-600">
              Last changed {new Date(account.trading_status_updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          <button type="submit" disabled={tradingSaving} className="w-full py-3 text-sm font-semibold text-black bg-[#F7931A] hover:bg-[#FFA73D] rounded-xl disabled:opacity-50 transition-colors">
            {tradingSaving ? 'Saving…' : 'Save Trading Status'}
          </button>
        </form>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Transaction History</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No transactions found</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-start gap-3 p-4">
                  <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    tx.type === 'adjustment' ? 'bg-violet-600/20 text-violet-400' :
                    tx.type === 'deposit' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-red-500/10 text-red-400'
                  }`}>
                    {tx.type === 'deposit' ? '+' : tx.type === 'adjustment' ? '⟳' : '−'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white capitalize">{tx.type.replace('_', ' ')}</p>
                      <p className="text-sm font-semibold text-white shrink-0">
                        ${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-slate-500 truncate">{tx.notes || '—'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                        tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        tx.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative z-10 glass rounded-2xl p-6 border border-white/[0.1] max-w-sm w-full">
            <h3 className="text-base font-bold text-white mb-1">Confirm Adjustment</h3>
            <p className="text-xs text-slate-500 mb-4">This action will be recorded in the audit log.</p>
            <div className="bg-white/[0.03] rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Client</span><span className="text-white font-medium">{profile.full_name || 'Unnamed'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Field</span><span className="text-white">{FIELD_LABELS[adjustForm.field]}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Operation</span><span className="text-white capitalize">{adjustForm.operation}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-white">${parseFloat(adjustForm.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">New Value</span><span className="text-emerald-400 font-semibold">${(newVal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400 shrink-0">Reason</span><span className="text-white text-right text-xs">{adjustForm.reason}</span></div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAdjustConfirm}
                className="flex-1 py-3 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 text-sm font-medium text-slate-400 border border-white/[0.08] rounded-xl hover:text-white hover:border-white/20 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

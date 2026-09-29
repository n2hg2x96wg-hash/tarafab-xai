'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { authFetch, errorText, newRequestKey, readJson, RequestError } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'

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
  updated_at?: string
}

type Profile = {
  id: string
  full_name: string | null
  role: string
  created_at: string
  account_status: string
  verification_status: string
  updated_at?: string
}

type Transaction = {
  id: string
  type: string
  method?: string | null
  direction?: 'credit' | 'debit' | null
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

// "Available Balance" is the client's spendable balance and is stored in
// available_balance (the field withdrawals and investments use). The older
// account_balance column is a recorded total kept for history/accounting; it is
// still accepted by the database but is no longer offered as an adjustment target.
const FIELD_LABELS = {
  account_balance: 'Recorded total (legacy)',
  available_balance: 'Available Balance',
  invested_balance: 'Invested Balance',
  pending_balance: 'Pending Balance',
  profit_balance: 'Profit Balance',
}
const ADJUST_FIELDS: AdjustForm['field'][] = ['available_balance', 'invested_balance', 'pending_balance', 'profit_balance']

export default function ClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)
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
    field: 'available_balance',
    operation: 'credit',
    amount: '',
    reason: '',
  })
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState('')
  const [adjustSuccess, setAdjustSuccess] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const { t } = useI18n()
  // One key per confirmed adjustment, so a retried request is applied once.
  const adjustKey = useRef(newRequestKey())
  // Which client the latest load belongs to; a slower response for a client
  // the admin has already navigated away from is discarded.
  const loadFor = useRef(clientId)

  useEffect(() => {
    loadFor.current = clientId
    load({ initial: true })
  }, [clientId])

  // A different adjustment gets a different key; an unchanged form retried
  // after a network error keeps its key and cannot be applied twice.
  useEffect(() => { adjustKey.current = newRequestKey() }, [adjustForm.field, adjustForm.operation, adjustForm.amount, adjustForm.reason])

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])

  const load = async ({ initial = false } = {}) => {
    const id = clientId
    if (initial) setLoading(true)
    const [p, a, t, e] = await Promise.all([
      (supabase.from('profiles') as any)
        .select('id, full_name, role, created_at, account_status, verification_status, updated_at').eq('id', id).maybeSingle() as Promise<{ data: Profile | null; error: { message: string } | null }>,
      (supabase.from('accounts') as any)
        .select('*').eq('user_id', id).maybeSingle() as Promise<{ data: Account | null; error: { message: string } | null }>,
      (supabase.from('transactions') as any)
        .select('id, type, method, direction, amount, status, notes, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20) as Promise<{ data: Transaction[] | null; error: { message: string } | null }>,
      supabase.rpc('admin_client_emails') as unknown as Promise<{ data: { id: string; email: string }[] | null }>,
    ])
    if (loadFor.current !== id) return
    // Keep what is on screen if a refresh fails, and say so.
    if (p.error || a.error || t.error) {
      setLoadError('Could not load the latest data for this client.')
      setLoading(false)
      return
    }
    setLoadError('')
    setLoadedAt(Date.now())
    const profileData = p.data, accountData = a.data, txData = t.data

    setProfile(profileData)
    setEmail(e.data?.find(x => x.id === id)?.email ?? null)
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
      await readJson(await authFetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: clientId, ...editForm, expected_updated_at: profile?.updated_at }),
      }))
      setEditSuccess('Client details saved.')
      await load()
    } catch (err) {
      setEditError(errorText(err))
      if (err instanceof RequestError && err.status === 409) await load()
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
      await readJson(await authFetch('/api/admin/set-trading-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: clientId,
          trading_status: tradingForm.trading_status,
          trading_strategy_name: tradingForm.trading_strategy_name,
          expected_updated_at: account?.trading_status_updated_at,
        }),
      }))
      setTradingSuccess('Trading status saved.')
      await load()
    } catch (err) {
      setTradingError(errorText(err))
      if (err instanceof RequestError && err.status === 409) await load()
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
      await readJson(await authFetch('/api/admin/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': adjustKey.current },
        body: JSON.stringify({
          target_user_id: clientId,
          field: adjustForm.field,
          operation: adjustForm.operation,
          amount: parseFloat(adjustForm.amount),
          reason: adjustForm.reason.trim(),
          // Rejected if the balances changed after this page loaded them.
          expected_updated_at: account?.updated_at,
        }),
      }))

      setAdjustSuccess(`${FIELD_LABELS[adjustForm.field]} updated successfully.`)
      setAdjustForm({ field: 'available_balance', operation: 'credit', amount: '', reason: '' })
      adjustKey.current = newRequestKey()
      await load()
    } catch (err) {
      setAdjustError(errorText(err))
      if (err instanceof RequestError && err.status === 409) { adjustKey.current = newRequestKey(); await load() }
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
          <p className="text-slate-400 text-sm mb-4">{loadError || 'Client not found'}</p>
          {loadError && <button onClick={() => load({ initial: true })} className="block mx-auto mb-4 text-sm text-white underline underline-offset-4">Try again</button>}
          <Link href="/admin/clients" className="text-violet-400 text-sm hover:text-violet-300">← Back to clients</Link>
        </div>
      </AdminLayout>
    )
  }

  const newVal = computeNewValue()

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 mb-5">
        <Link href="/admin" className="hover:text-white transition-colors">Admin</Link>
        <span className="text-slate-700">/</span>
        <Link href="/admin/clients" className="hover:text-white transition-colors">Clients</Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 truncate max-w-[160px]">{profile.full_name || 'Client'}</span>
      </nav>

      {/* Client header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(247,147,26,0.07),rgba(99,102,241,0.05)_45%,rgba(255,255,255,0.015))] p-5 sm:p-6 mb-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-ink-800 border border-white/[0.1] flex items-center justify-center text-lg font-semibold text-white shrink-0">
            {(profile.full_name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">{profile.full_name || 'Unnamed client'}</h1>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-semibold ${profile.role === 'admin' ? 'text-violet-300 border-violet-500/30 bg-violet-500/10' : 'text-slate-400 border-white/[0.08] bg-white/[0.03]'}`}>
                {profile.role}
              </span>
            </div>
            {email && (
              <div className="flex items-center gap-2 mt-1 min-w-0">
                <span className="text-sm text-slate-300 select-all break-all">{email}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(email).then(() => { setEmailCopied(true); setTimeout(() => setEmailCopied(false), 1800) }).catch(() => {})}
                  className="text-[10px] text-slate-300 border border-white/[0.12] rounded-md px-2 py-0.5 hover:bg-white/[0.05] shrink-0"
                >
                  {emailCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border capitalize ${profile.account_status === 'suspended' ? 'text-red-300 border-red-500/30 bg-red-500/[0.08]' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.08]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${profile.account_status === 'suspended' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                {profile.account_status}
              </span>
              <span className={`text-[11px] px-2 py-1 rounded-md border capitalize ${profile.verification_status === 'verified' ? 'text-sky-300 border-sky-500/30 bg-sky-500/[0.08]' : profile.verification_status === 'rejected' ? 'text-red-300 border-red-500/30 bg-red-500/[0.08]' : 'text-slate-300 border-white/[0.1] bg-white/[0.03]'}`}>
                {profile.verification_status}
              </span>
              <span className={`text-[11px] px-2 py-1 rounded-md border ${account?.trading_status === 'active' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.08]' : 'text-slate-400 border-white/[0.08] bg-white/[0.02]'}`}>
                Monitoring {account?.trading_status === 'active' ? 'active' : 'inactive'}
              </span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap gap-x-4 gap-y-1">
          <span>Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <span className="font-mono text-slate-600 break-all">ID {profile.id}</span>
          {loadedAt && (
            <span className="sm:ml-auto flex items-center gap-2">
              {Date.now() - loadedAt < 60_000 ? t('admin.updatedJustNow') : t('admin.loadedAgo', { n: Math.floor((Date.now() - loadedAt) / 60_000) })}
              <button onClick={() => load()} className="text-slate-300 underline underline-offset-2 hover:text-white">{t('common.refresh')}</button>
            </span>
          )}
        </p>
        {loadError && (
          <p role="alert" className="mt-3 text-[12px] text-amber-300">{loadError} {t('admin.staleNote')}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-ink-950 p-1 rounded-xl border border-white/[0.07] w-full sm:w-fit overflow-x-auto">
        {(['overview', 'adjust', 'edit', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-ink-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-slate-500 hover:text-slate-200'}`}
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
                { label: 'Available Balance', value: account.available_balance, accent: true },
                { label: 'Profit', value: account.profit_balance },
                { label: 'Invested', value: account.invested_balance },
                { label: 'Pending', value: account.pending_balance },
                { label: 'Recorded total (legacy)', value: account.account_balance },
              ].map((item, i) => (
                <div key={item.label} className={`rounded-xl p-4 border ${i === 0 ? 'col-span-2 sm:col-span-1' : ''} ${item.accent ? 'border-orange-500/25 bg-[linear-gradient(160deg,rgba(247,147,26,0.10),rgba(255,255,255,0.01))]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{item.label}</p>
                  <p className="text-lg sm:text-xl font-semibold text-white tabular-nums">${(item.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-5 border border-white/[0.08] mb-5 text-sm text-slate-500">
              No account record found for this user.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setTab('adjust')}
              className="text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover px-5 py-3 rounded-xl transition-colors shadow-[0_8px_24px_-10px_rgba(247,147,26,0.6)]"
            >
              Adjust balance
            </button>
            <button
              onClick={() => setTab('edit')}
              className="text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl transition-colors"
            >
              Edit details &amp; status
            </button>
            <button
              onClick={() => setTab('history')}
              className="text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl transition-colors"
            >
              View history
            </button>
            <Link
              href={`/admin/notifications?to=${clientId}`}
              className="text-center text-sm font-semibold text-slate-200 border border-white/[0.12] hover:bg-white/[0.04] px-5 py-3 rounded-xl transition-colors"
            >
              {t('adminNotif.send')}
            </Link>
          </div>
          <ClientFinancialProfile clientId={clientId} />
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
                {ADJUST_FIELDS.map(k => (
                  <option key={k} value={k}>{FIELD_LABELS[k]}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                {adjustForm.field === 'available_balance' && 'The client’s spendable balance: what they see as Available Balance and can withdraw or invest.'}
                {adjustForm.field === 'invested_balance' && 'Principal currently invested. It is separate from the Available Balance and is not spendable.'}
                {adjustForm.field === 'pending_balance' && 'Amounts held for pending requests. Separate from the Available Balance.'}
                {adjustForm.field === 'profit_balance' && 'Recorded profit. Separate from the Available Balance; it is not added to it.'}
              </p>
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
            className="w-full mt-6 py-3.5 text-sm font-semibold text-[#fff] bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2"
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
          <button type="submit" disabled={editSaving} className="w-full py-3 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl disabled:opacity-50 transition-colors">
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
              Controls the &ldquo;Portfolio monitoring active / inactive&rdquo; status this client sees on their dashboard. There is no automated trading engine yet — only turn this on if trading is genuinely happening on this account. Every change is recorded in the audit log.
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
          <button type="submit" disabled={tradingSaving} className="w-full py-3 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl disabled:opacity-50 transition-colors">
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
            <div className="p-10 text-center text-slate-500 text-sm">No transactions yet.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-start gap-3 p-4">
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 border ${
                    tx.type === 'deposit' || tx.direction === 'credit' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    tx.type === 'adjustment' && !tx.direction ? 'bg-white/[0.04] text-slate-400 border-white/[0.08]' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {tx.type === 'deposit' || tx.direction === 'credit' ? '+' : tx.type === 'adjustment' && !tx.direction ? '·' : '−'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white capitalize">
                        {tx.type.replace(/_/g, ' ')}
                        {tx.type === 'adjustment' && tx.method && <span className="text-slate-500 font-normal"> · {tx.method.replace(/_/g, ' ')}</span>}
                      </p>
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
                className="flex-1 py-3 text-sm font-semibold text-[#fff] bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 transition-all"
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

// Read-only financial profile of one client: KYC, investments with their own
// profit / return, and deposit / withdrawal totals. Nothing here edits data;
// profit changes happen in the Investment Center, balance changes in "Adjust".
function ClientFinancialProfile({ clientId }: { clientId: string }) {
  const supabase = createClient()
  type Inv = { id: string; reference: string | null; status: string; principal: number; profit_amount: number | null; created_at: string; maturity_date: string | null; investment_products: { code: string } | null }
  const [data, setData] = useState<{ kyc: string; invs: Inv[]; deposits: number; withdrawals: number } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [k, i, d, w] = await Promise.all([
        supabase.from('kyc_submissions').select('status').eq('user_id', clientId).order('submitted_at', { ascending: false }).limit(1),
        (supabase.from('client_investments') as any).select('id, reference, status, principal, profit_amount, created_at, maturity_date, investment_products(code)').eq('user_id', clientId).order('created_at', { ascending: false }).limit(50),
        (supabase.from('transactions') as any).select('amount').eq('user_id', clientId).eq('type', 'deposit').eq('status', 'completed').limit(1000),
        (supabase.from('transactions') as any).select('amount').eq('user_id', clientId).eq('type', 'withdrawal').eq('status', 'completed').limit(1000),
      ])
      if (!alive) return
      if (i.error) { setError(true); return }
      const sum = (r: { data: { amount: number }[] | null }) => (r.data || []).reduce((s, x) => s + Number(x.amount), 0)
      setData({ kyc: (k.data?.[0] as { status?: string } | undefined)?.status || 'not submitted', invs: i.data || [], deposits: sum(d), withdrawals: sum(w) })
    })()
    return () => { alive = false }
  }, [supabase, clientId])
  const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${usd(Math.abs(n))}`
  if (error) return <p className="mt-5 text-xs text-amber-300">Investments could not be loaded.</p>
  if (!data) return <div className="mt-5 h-24 rounded-xl bg-white/[0.02] animate-pulse" />
  const active = data.invs.filter(x => x.status === 'active').length
  const completed = data.invs.filter(x => x.status === 'completed' || x.status === 'matured').length
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[['KYC status', data.kyc.replace(/_/g, ' ')], ['Active investments', String(active)], ['Completed investments', String(completed)], ['Deposits (completed)', usd(data.deposits)], ['Withdrawals (completed)', usd(data.withdrawals)]].map(([l, v]) => (
          <div key={l} className="rounded-xl p-3 border border-white/[0.07] bg-white/[0.02] min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{l}</p>
            <p className="text-sm font-semibold text-white capitalize truncate mt-1">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.07] overflow-hidden">
        <p className="px-4 py-3 text-xs font-semibold text-white border-b border-white/[0.06]">Investments</p>
        {data.invs.length === 0 ? <p className="px-4 py-5 text-xs text-slate-500">No investments.</p> : (
          <ul className="divide-y divide-white/[0.04]">
            {data.invs.map(x => {
              const p = Number(x.profit_amount || 0)
              return (
                <li key={x.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0"><span className="text-white font-mono text-xs">{x.reference || x.id.slice(0, 8)}</span> <span className="text-slate-500 text-xs">{x.investment_products?.code} · {x.status === 'pending_activation' ? 'pending' : x.status}</span></span>
                  <span className="tabular-nums text-xs text-slate-300">Principal {usd(Number(x.principal))} · Value {usd(Number(x.principal) + p)} · <span className={p > 0 ? 'text-emerald-400' : p < 0 ? 'text-red-400' : ''}>{signed(p)}</span></span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-white/[0.06]">Profit / return is edited per investment in <Link href="/admin/investments" className="underline">Investment Center</Link>; every change is audited.</p>
      </div>
    </div>
  )
}

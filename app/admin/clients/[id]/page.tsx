'use client'

import { useEffect, useRef, useState } from 'react'
import { adminTxLabel, isAccountCredit, PROFIT_BALANCE_CATEGORIES, txCategory, txSign } from '@/lib/txCategory'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { ClientWallets } from '@/components/admin/ClientWallets'
import { parseEffective, toLocalInput } from '@/lib/effectiveDate'
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
  reference?: string | null
  source?: string | null
  created_at: string
  effective_at?: string
}

// What the administrator is doing. Each action is recorded by its meaning
// (see lib/txCategory): Fund = Account Credit (client: Deposit · Account
// credit), Debit = Account Debit, Fee = a real Fee row (admin_apply_fee),
// Profit balance = Profit adjustment (never an investment return). "Other"
// keeps the remaining balance fields and the exact-value operation.
type BalanceAction = 'fund' | 'debit' | 'fee' | 'profit' | 'other'
const ACTIONS: { id: BalanceAction; title: string; hint: string; reason: string }[] = [
  { id: 'fund', title: 'Fund account', hint: 'Add money to the spendable Account Balance.', reason: 'e.g. Manual account funding' },
  { id: 'debit', title: 'Debit account', hint: 'Take money off the Account Balance, e.g. a balance correction. Not a fee or withdrawal.', reason: 'e.g. Balance correction' },
  { id: 'fee', title: 'Apply fee', hint: 'Charge the client a fee from the Account Balance. Recorded as a Fee.', reason: 'e.g. Maintenance fee' },
  { id: 'profit', title: 'Adjust profit balance', hint: 'Change the client’s recorded profit balance. Choose a reason for this adjustment. This action is separate from automatically generated investment returns.', reason: 'e.g. Premium loyalty reward' },
  { id: 'other', title: 'Other balance', hint: 'Invested or pending balance, or set an exact value.', reason: 'e.g. Pending balance correction' },
]
// Why the profit balance is changed. The category (not the free-text reason)
// decides how the entry is named; none of these is an investment return.
type ProfitCategory = 'loyalty_reward' | 'promotional_credit' | 'profit_correction' | 'reconciliation' | 'other'
const PROFIT_REASONS: { id: ProfitCategory; title: string; client: string; creditOnly?: boolean }[] = [
  { id: 'loyalty_reward', title: 'Loyalty reward', client: 'Profit · Loyalty Reward', creditOnly: true },
  { id: 'promotional_credit', title: 'Promotional credit', client: 'Profit · Promotional Credit', creditOnly: true },
  { id: 'profit_correction', title: 'Profit balance correction', client: 'Profit Balance Correction' },
  { id: 'reconciliation', title: 'Account reconciliation', client: 'Account Reconciliation' },
  { id: 'other', title: 'Other documented correction', client: 'Profit' },
]
const PROFIT_SOURCE_CATEGORY: Record<string, ProfitCategory> = {
  loyalty_reward: 'loyalty_reward', promotional_credit: 'promotional_credit', profit_correction: 'profit_correction',
  reconciliation: 'reconciliation', profit_adjustment: 'other',
}

const ACTION_DEFAULTS: Record<BalanceAction, Pick<AdjustForm, 'field' | 'operation'>> = {
  fund: { field: 'available_balance', operation: 'credit' },
  debit: { field: 'available_balance', operation: 'debit' },
  fee: { field: 'available_balance', operation: 'debit' },
  profit: { field: 'profit_balance', operation: 'credit' },
  other: { field: 'invested_balance', operation: 'credit' },
}

type AdjustForm = {
  action: BalanceAction
  category: '' | ProfitCategory // profit-balance changes only
  field: 'account_balance' | 'available_balance' | 'invested_balance' | 'pending_balance' | 'profit_balance'
  operation: 'credit' | 'debit' | 'set'
  amount: string
  reason: string
  effective: string // '' = now; otherwise a datetime-local value (backdating)
}

// "Account Balance" is the client's spendable balance and is stored in
// available_balance (the field withdrawals and investments use). The older
// account_balance column is a recorded total kept for history/accounting; it is
// still accepted by the database but is no longer offered as an adjustment target.
const FIELD_LABELS = {
  account_balance: 'Recorded total (legacy)',
  available_balance: 'Account Balance',
  invested_balance: 'Invested Balance',
  pending_balance: 'Pending Balance',
  profit_balance: 'Profit Balance',
}
const ADJUST_FIELDS: AdjustForm['field'][] = ['available_balance', 'invested_balance', 'pending_balance', 'profit_balance']

// How the resulting entry is named, by the same rule the database uses
// (lib/txCategory): [what the client sees, what admin history shows].
function entryNames(f: AdjustForm): [string, string] {
  if (f.action === 'fee') return ['Fee', 'Fee']
  if (f.field === 'available_balance' || f.field === 'account_balance') {
    if (f.operation === 'credit') return ['Deposit · Account credit', 'Account Credit']
    if (f.operation === 'debit') return ['Account Debit', 'Account Debit']
    return ['Deposit · Account credit if raised, Account Debit if lowered', 'Account Credit / Account Debit']
  }
  if (f.field === 'profit_balance') {
    // The client sees the category's name with the admin's reason beneath it.
    const r = PROFIT_REASONS.find(x => x.id === f.category)
    return r ? [`${r.client} — ${f.reason.trim() || 'your reason'}`, r.id === 'other' ? (f.operation === 'debit' ? 'Profit · Manual debit' : 'Profit · Manual credit') : r.client] : ['Choose a reason', 'Choose a reason']
  }
  return ['Adjustment', 'Adjustment']
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
    action: 'fund',
    category: '',
    field: 'available_balance',
    operation: 'credit',
    amount: '',
    reason: '',
    effective: '',
  })
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState('')
  const [adjustSuccess, setAdjustSuccess] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [loadError, setLoadError] = useState('')
  // "Set reason" on one existing profit-balance adjustment (meaning only).
  const [catEdit, setCatEdit] = useState<{ id: string; category: '' | ProfitCategory; reason: string } | null>(null)
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')
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
  useEffect(() => { adjustKey.current = newRequestKey() }, [adjustForm.action, adjustForm.category, adjustForm.field, adjustForm.operation, adjustForm.amount, adjustForm.reason, adjustForm.effective])

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
        .select('id, type, method, direction, source, amount, status, notes, reference, created_at, effective_at')
        .eq('user_id', id)
        .order('effective_at', { ascending: false })
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
    if (adjustForm.action === 'profit' && !adjustForm.category) { setAdjustError('Choose a reason category for this profit balance adjustment'); return }
    if (parseEffective(adjustForm.effective).error) { setAdjustError(parseEffective(adjustForm.effective).error); return }
    const newVal = computeNewValue()
    if (newVal === null || newVal < 0) { setAdjustError('Resulting balance cannot be negative'); return }
    setShowConfirm(true)
  }

  const handleAdjustConfirm = async () => {
    setShowConfirm(false)
    setAdjusting(true)
    setAdjustError('')

    try {
      const isFee = adjustForm.action === 'fee'
      await readJson(await authFetch(isFee ? '/api/admin/apply-fee' : '/api/admin/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': adjustKey.current },
        body: JSON.stringify({
          target_user_id: clientId,
          ...(isFee ? {} : { field: adjustForm.field, operation: adjustForm.operation }),
          ...(adjustForm.action === 'profit' ? { category: adjustForm.category } : {}),
          amount: parseFloat(adjustForm.amount),
          reason: adjustForm.reason.trim(),
          effective_at: parseEffective(adjustForm.effective).iso,
          // Rejected if the balances changed after this page loaded them.
          expected_updated_at: account?.updated_at,
        }),
      }))

      setAdjustSuccess(`${ACTIONS.find(a => a.id === adjustForm.action)?.title}: ${entryNames(adjustForm)[1]} of $${parseFloat(adjustForm.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} recorded. ${FIELD_LABELS[adjustForm.field]} updated successfully.`)
      setAdjustForm({ action: 'fund', category: '', field: 'available_balance', operation: 'credit', amount: '', reason: '', effective: '' })
      adjustKey.current = newRequestKey()
      await load()
    } catch (err) {
      setAdjustError(errorText(err))
      if (err instanceof RequestError && err.status === 409) { adjustKey.current = newRequestKey(); await load() }
    } finally {
      setAdjusting(false)
    }
  }

  // The reason editor is only open while the admin is using it.
  useEffect(() => { setCatEdit(null); setCatError('') }, [tab, clientId])

  const saveCategory = async () => {
    if (!catEdit) return
    setCatError('')
    if (!catEdit.category) { setCatError('Choose a reason category.'); return }
    if (catEdit.reason.trim().length < 3) { setCatError('Enter why you are setting this reason (kept in the audit log).'); return }
    setCatSaving(true)
    try {
      await readJson(await authFetch('/api/admin/transaction-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: catEdit.id, category: catEdit.category, reason: catEdit.reason.trim() }),
      }))
      setCatEdit(null)
      await load()
    } catch (err) {
      setCatError(errorText(err))
    } finally {
      setCatSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
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
          <Link href="/admin/clients" className="text-accent text-sm hover:text-accent-hover">← Back to clients</Link>
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
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-semibold ${profile.role === 'admin' ? 'text-accent border-accent/30 bg-accent/10' : 'text-slate-400 border-white/[0.08] bg-white/[0.03]'}`}>
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
            {t === 'overview' ? 'Overview' : t === 'adjust' ? 'Balance Actions' : t === 'edit' ? 'Edit Details' : 'History'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div>
          {account ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Account Balance', value: account.available_balance, accent: true },
                { label: 'Profit', value: account.profit_balance },
                { label: 'Invested', value: account.invested_balance },
                { label: 'Pending', value: account.pending_balance },
              ].map((item, i) => (
                <div key={item.label} className={`rounded-xl p-4 border ${i === 0 ? 'col-span-2 lg:col-span-1' : ''} ${item.accent ? 'border-orange-500/25 bg-[linear-gradient(160deg,rgba(247,147,26,0.10),rgba(255,255,255,0.01))]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
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
              Balance actions
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
          <ClientWallets clientId={clientId} />
        </div>
      )}

      {/* Adjust tab */}
      {tab === 'adjust' && (
        <div className="glass rounded-2xl p-5 sm:p-6 border border-white/[0.08] max-w-lg">
          <h2 className="text-sm font-semibold text-white mb-1">Balance actions</h2>
          <p className="text-xs text-slate-500 mb-5">Choose what you are doing; the entry is recorded and shown by that meaning. Every action is logged to the audit trail. To record an investment&rsquo;s return, use that investment&rsquo;s profit control in the <Link href="/admin/investments" className="text-accent hover:text-accent-hover underline-offset-2 hover:underline">Investment Center</Link>: only that is shown to the client as Profit.</p>

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
            <fieldset>
              <legend className="block text-xs font-medium text-slate-400 mb-1.5">Action</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Balance action" data-balance-actions>
                {ACTIONS.map(a => {
                  const on = adjustForm.action === a.id
                  return (
                    <button key={a.id} type="button" role="radio" aria-checked={on} disabled={adjusting}
                      onClick={() => setAdjustForm(f => ({ ...f, action: a.id, category: '', ...ACTION_DEFAULTS[a.id] }))}
                      className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-white/[0.08] hover:border-white/20'} ${a.id === 'other' ? 'sm:col-span-2' : ''}`}
                      data-balance-action={a.id}>
                      <span className={`block text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{on ? '● ' : ''}{a.title}</span>
                      <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{a.hint}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {adjustForm.action === 'other' && (
              <div>
                <label htmlFor="adj-field" className="block text-xs font-medium text-slate-400 mb-1.5">Balance Field</label>
                <select
                  id="adj-field"
                  value={adjustForm.field}
                  onChange={e => setAdjustForm(f => ({ ...f, field: e.target.value as AdjustForm['field'] }))}
                  className="input-field text-sm"
                  disabled={adjusting}
                >
                  {ADJUST_FIELDS.filter(k => k !== 'profit_balance').map(k => (
                    <option key={k} value={k}>{FIELD_LABELS[k]}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                  {adjustForm.field === 'available_balance' && 'The client’s spendable balance. Use Fund account, Debit account or Apply fee unless you need to set an exact value.'}
                  {adjustForm.field === 'invested_balance' && 'Principal currently invested. It is separate from the Account Balance and is not spendable.'}
                  {adjustForm.field === 'pending_balance' && 'Amounts held for pending requests. Separate from the Account Balance.'}
                </p>
              </div>
            )}

            {adjustForm.action === 'profit' && (
              <div>
                <label htmlFor="adj-category" className="block text-xs font-medium text-slate-400 mb-1.5">Reason category</label>
                <select
                  id="adj-category"
                  value={adjustForm.category}
                  onChange={e => {
                    const c = e.target.value as AdjustForm['category']
                    setAdjustForm(f => ({ ...f, category: c, operation: PROFIT_REASONS.find(r => r.id === c)?.creditOnly ? 'credit' : f.operation }))
                  }}
                  className="input-field text-sm"
                  disabled={adjusting}
                  required
                >
                  <option value="" disabled>Choose a reason…</option>
                  {PROFIT_REASONS.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-500">The category decides how the entry is named. The reason you write below is shown to the client under it, exactly as written, and kept in the audit trail. A reward or promotional credit can only be a credit.</p>
              </div>
            )}

            {(adjustForm.action === 'profit' || adjustForm.action === 'other') && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Operation</label>
                <div className="flex gap-2">
                  {(['credit', 'debit', 'set'] as const).map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setAdjustForm(f => ({ ...f, operation: op }))}
                      disabled={adjusting || (op !== 'credit' && adjustForm.action === 'profit' && !!PROFIT_REASONS.find(r => r.id === adjustForm.category)?.creditOnly)}
                      aria-pressed={adjustForm.operation === op}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border ${adjustForm.operation === op
                        ? op === 'credit' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : op === 'debit' ? 'bg-red-500/15 text-red-400 border-red-500/30'
                          : 'bg-accent/15 text-accent border-accent/20'
                        : 'text-slate-500 border-white/[0.06] hover:text-white hover:border-white/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {op === 'credit' ? '+ Credit' : op === 'debit' ? '− Debit' : '= Set'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* How each side will name the resulting entry (same rule as the database: lib/txCategory). */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[11px] space-y-1" data-client-sees>
              <p className="text-slate-400">Client sees: <span className="text-slate-200 font-medium" data-preview-client>{entryNames(adjustForm)[0]}</span></p>
              <p className="text-slate-400">Admin history: <span className="text-slate-200 font-medium" data-preview-admin>{entryNames(adjustForm)[1]}</span></p>
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
              <label htmlFor="adj-reason" className="block text-xs font-medium text-slate-400 mb-1.5">Reason{adjustForm.action === 'profit' && <span className="text-slate-500 font-normal"> · shown to the client</span>}</label>
              <textarea
                id="adj-reason"
                value={adjustForm.reason}
                onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={ACTIONS.find(a => a.id === adjustForm.action)?.reason}
                rows={3}
                className="input-field resize-none text-sm"
                disabled={adjusting}
              />
            </div>

            <div>
              <label htmlFor="adj-effective" className="block text-xs font-medium text-slate-400 mb-1.5">Effective date</label>
              <input
                id="adj-effective"
                type="datetime-local"
                value={adjustForm.effective}
                max={toLocalInput(new Date())}
                min="2020-01-01T00:00"
                onChange={e => setAdjustForm(f => ({ ...f, effective: e.target.value }))}
                className="input-field text-sm"
                disabled={adjusting}
              />
              <p className="text-[11px] text-slate-500 mt-1">Leave empty for now. Set an earlier date to record the transaction on the date it applies to; the client sees that date. The recording time and your name are kept in the audit log only.</p>
            </div>
          </div>

          <button
            onClick={handleAdjustSubmit}
            disabled={adjusting || !adjustForm.amount || !adjustForm.reason.trim() || (adjustForm.action === 'profit' && !adjustForm.category)}
            className="w-full mt-6 py-3.5 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(247,147,26,0.3)] flex items-center justify-center gap-2"
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
                    txSign(tx) > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    txSign(tx) === 0 ? 'bg-white/[0.04] text-slate-400 border-white/[0.08]' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {txSign(tx) > 0 ? '+' : txSign(tx) === 0 ? '·' : '−'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      {/* Named by the event that created it (lib/txCategory), in admin wording:
                          Account Credit / Account Debit / Fee / Profit… never by the sign alone. */}
                      <p className="text-sm font-medium text-white" data-admin-tx-type={isAccountCredit(tx) ? 'account_credit' : txCategory(tx)}>
                        {adminTxLabel(tx)}
                        {txCategory(tx) === 'adjustment' && tx.method && <span className="text-slate-500 font-normal"> · {tx.method.replace(/_/g, ' ')}</span>}
                      </p>
                      <p className="text-sm font-semibold text-white shrink-0 tabular-nums" data-admin-signed-amount>
                        {txSign(tx) > 0 ? '+' : txSign(tx) < 0 ? '−' : ''}${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex items-start justify-between gap-2 mt-0.5">
                      {/* The reason the admin entered, saved on this transaction. Shown in
                          full for profit-balance entries (it is also what the client sees). */}
                      <p className={`text-xs break-words min-w-0 ${PROFIT_BALANCE_CATEGORIES.includes(txCategory(tx)) ? 'text-slate-300' : 'text-slate-500 line-clamp-2'}`} data-admin-reason>
                        {tx.notes?.trim() || (PROFIT_BALANCE_CATEGORIES.includes(txCategory(tx)) ? 'Reason not recorded' : '—')}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                        tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        tx.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(tx.effective_at || tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}{tx.effective_at && tx.effective_at !== tx.created_at ? ` · recorded ${new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                      {tx.reference && <> · <span className="font-mono">{tx.reference}</span></>}
                    </p>
                    {/* "Edit reason": an explicit admin action to correct the reason
                        category of a profit-balance entry; only its meaning changes
                        (audited), never the amount, dates or balance. */}
                    {tx.type === 'adjustment' && tx.method === 'profit_balance' && tx.source && tx.source in PROFIT_SOURCE_CATEGORY && (
                      catEdit?.id === tx.id ? (
                        <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2" data-cat-editor
                          onKeyDown={e => { if (e.key === 'Escape' && !catSaving) { setCatEdit(null); setCatError('') } }}>
                          <p className="text-[11px] font-semibold text-slate-200">Edit reason · {tx.reference}</p>
                          <label className="block text-[11px] text-slate-400" htmlFor={`cat-${tx.id}`}>Reason category</label>
                          <select id={`cat-${tx.id}`} value={catEdit.category} disabled={catSaving}
                            onChange={e => setCatEdit(c => c && ({ ...c, category: e.target.value as ProfitCategory }))} className="input-field text-xs py-2">
                            <option value="" disabled>Choose a reason…</option>
                            {PROFIT_REASONS.filter(r => !r.creditOnly || tx.direction === 'credit').map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                          </select>
                          <input value={catEdit.reason} disabled={catSaving} onChange={e => setCatEdit(c => c && ({ ...c, reason: e.target.value }))}
                            placeholder="Note for the audit log, e.g. Matches the reason entered" aria-label="Note for the audit log" className="input-field text-xs py-2" />
                          <p className="text-[10px] text-slate-500">Changes only the category shown above the reason. The reason text, amount, dates, reference and balances stay exactly as recorded.</p>
                          {catError && <p className="text-[11px] text-red-400" role="alert">{catError}</p>}
                          <div className="flex gap-2">
                            <button type="button" onClick={saveCategory} disabled={catSaving} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-50">{catSaving ? 'Saving…' : 'Save reason'}</button>
                            <button type="button" onClick={() => { setCatEdit(null); setCatError('') }} disabled={catSaving} className="px-3 py-1.5 text-xs rounded-lg border border-white/[0.1] text-slate-300 hover:text-white">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setCatError(''); setCatEdit({ id: tx.id, category: tx.source === 'profit_adjustment' ? '' : PROFIT_SOURCE_CATEGORY[tx.source!], reason: '' }) }}
                          className="mt-1.5 text-[11px] text-slate-400 hover:text-accent-hover underline-offset-2 hover:underline" data-set-reason>
                          Edit reason
                        </button>
                      )
                    )}
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
            <h3 className="text-base font-bold text-white mb-1" data-confirm-title>{ACTIONS.find(a => a.id === adjustForm.action)?.title}</h3>
            <p className="text-xs text-slate-500 mb-4">Check the details. This action will be recorded in the audit log.</p>
            <div className="bg-white/[0.03] rounded-xl p-4 mb-4 space-y-2 text-sm" data-confirm-details>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Client</span><span className="text-white font-medium text-right">{profile.full_name || 'Unnamed'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Balance</span><span className="text-white text-right">{FIELD_LABELS[adjustForm.field]}</span></div>
              {adjustForm.action === 'profit' && <div className="flex justify-between gap-3"><span className="text-slate-400">Reason category</span><span className="text-white text-right">{PROFIT_REASONS.find(r => r.id === adjustForm.category)?.title}</span></div>}
              {(adjustForm.action === 'profit' || adjustForm.action === 'other') && <div className="flex justify-between gap-3"><span className="text-slate-400">Operation</span><span className="text-white capitalize">{adjustForm.operation}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-slate-400">Amount</span><span className="text-white tabular-nums">{adjustForm.operation === 'set' ? '= ' : adjustForm.operation === 'credit' ? '+' : '−'}${parseFloat(adjustForm.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">New balance</span><span className="text-emerald-400 font-semibold tabular-nums">${(newVal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400 shrink-0">Reason</span><span className="text-white text-right text-xs">{adjustForm.reason}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Effective date</span><span className="text-white">{adjustForm.effective ? new Date(adjustForm.effective).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Now'}</span></div>
              <div className="pt-2 mt-1 border-t border-white/[0.06] space-y-1 text-xs">
                <div className="flex justify-between gap-3"><span className="text-slate-400 shrink-0">Client sees</span><span className="text-slate-200 text-right">{entryNames(adjustForm)[0]}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400 shrink-0">Admin history</span><span className="text-slate-200 text-right">{entryNames(adjustForm)[1]}</span></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAdjustConfirm}
                className="flex-1 py-3 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 transition-all"
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

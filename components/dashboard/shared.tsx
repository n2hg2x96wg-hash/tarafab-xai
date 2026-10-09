'use client'

import type { ReactNode } from 'react'

// Types and small display helpers shared by the dashboard sections.
import { IconArrowDown, IconArrowUp, IconCheck, IconFile, IconHistory, IconPie, IconSliders, IconSwap, IconTrend, IconWallet } from '@/components/Icons'
import { PROFIT_BALANCE_CATEGORIES, txCategory, txSign } from '@/lib/txCategory'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { statusLabel } from '@/lib/i18n/format'
import type { InvestmentSummary } from '@/lib/investmentSummary'

export interface Account {
  account_balance: number
  available_balance: number
  invested_balance: number
  pending_balance: number
  pending_transaction_count?: number
  profit_balance?: number
  trading_status?: 'active' | 'inactive' | null
  trading_strategy_name?: string | null
  trading_status_updated_at?: string | null
  // From client_investment_summary(); null = could not be read (shown as unavailable).
  investments?: InvestmentSummary | null
}

export interface UserInfo {
  id: string
  email: string
  full_name: string | null
  role: string
  email_confirmed?: boolean
  created_at?: string
  last_sign_in_at?: string | null
}

export interface Tx {
  id: string
  type: string
  method: string | null
  amount: number
  fee: number | null
  status: string
  reference: string | null
  notes: string | null
  address?: string | null
  direction?: 'credit' | 'debit' | null
  // Reason the admin entered for a profit-balance adjustment (that row's own
  // note; only sent for those rows).
  reason?: string | null
  // Business event that created the row (set by the database; see lib/txCategory).
  source?: string | null
  created_at: string
  updated_at?: string
}

export const SUPPORT_EMAIL = 'tarafab.support@gmail.com'
export const OPEN_STATUSES = ['pending_review', 'pending', 'requested', 'under_review']

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-emerald-400 border-emerald-500/30',
  approved: 'text-emerald-400 border-emerald-500/30',
  rejected: 'text-red-400 border-red-500/30',
  failed: 'text-red-400 border-red-500/30',
  pending: 'text-amber-400 border-amber-500/30',
  pending_review: 'text-amber-400 border-amber-500/30',
  pending_verification: 'text-amber-400 border-amber-500/30',
  pending_blockchain_confirmation: 'text-sky-400 border-sky-500/30',
}

export function StatusTag({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={`tag ${STATUS_STYLE[status] || 'text-fg-muted border-ink-600'}`}>{statusLabel(t, status)}</span>
}

export function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type T = ReturnType<typeof useI18n>['t']
export function txLabel(tx: Tx, t: T) {
  // Named by the event that created the row (lib/txCategory), not by whether
  // the balance went up: an admin top-up is a Deposit, only an investment
  // return is Profit.
  const c = txCategory(tx)
  if (c === 'profit') return t('dash.txType.profit')
  // A profit-balance credit or debit with no category: a Profit entry whose
  // description is the admin's reason (see txDescription), never "Adjustment".
  if (c === 'profit_adjustment') return t('dash.txType.profit')
  if (c === 'loyalty_reward') return `${t('dash.txType.profit')} · ${t('dash.txType.loyaltyReward')}`
  if (c === 'promotional_credit') return `${t('dash.txType.profit')} · ${t('dash.txType.promotionalCredit')}`
  if (c === 'profit_correction') return t('dash.txType.profitCorrection')
  if (c === 'reconciliation') return t('dash.txType.reconciliation')
  if (c === 'deposit') return t('dash.txType.deposit')
  if (c === 'account_debit') return t('dash.txType.accountDebit')
  if (c === 'reversal') return t('dash.txType.reversal')
  if (c === 'adjustment') return t('dash.txType.adjustment')
  // Tarafab's own service fees are always named as such, never as a network fee.
  if (tx.type === 'fee' && tx.method === 'service_fee') return t('dash.txType.serviceFee')
  return t(`dash.txType.${tx.type}` as TKey) || tx.type.replace(/_/g, ' ')
}

// One short line of context under the label, from the event's meaning only
// (never the admin's free-text note): says plainly when a profit-balance credit
// is a reward or a correction rather than an investment return.
const TX_DESC: Partial<Record<ReturnType<typeof txCategory>, TKey>> = {
  profit: 'dash.txDesc.profit',
  account_debit: 'dash.txDesc.accountDebit',
  loyalty_reward: 'dash.txDesc.loyaltyReward',
  promotional_credit: 'dash.txDesc.promotionalCredit',
  profit_correction: 'dash.txDesc.profitCorrection',
  reconciliation: 'dash.txDesc.reconciliation',
  profit_adjustment: 'dash.txDesc.profitAdjustment',
  reversal: 'dash.txDesc.reversal',
}
export function txDescription(tx: Tx, t: T): string | null {
  const c = txCategory(tx)
  // Profit-balance adjustments: the exact reason the admin entered for this
  // transaction; with none recorded, the category's fixed line, or a neutral
  // "Reason not recorded" — never an invented reason.
  if (PROFIT_BALANCE_CATEGORIES.includes(c)) {
    const r = (tx.reason || '').trim()
    if (r) return r
    return c === 'profit_adjustment' ? t('dash.txDesc.reasonNotRecorded') : t(TX_DESC[c]!)
  }
  if (c === 'fee' && tx.method === 'available_balance') return t('dash.txDesc.adminFee')
  const k = TX_DESC[c]
  return k ? t(k) : null
}

// Display name for a stored method code. Known codes are translated; common
// coin codes read as names; anything else is tidied (never shown raw like "btc").
const COIN: Record<string, string> = { btc: 'Bitcoin (BTC)', eth: 'Ethereum (ETH)', ethereum: 'Ethereum (ETH)', usdt: 'Tether (USDT)', usdc: 'USD Coin (USDC)' }
export function methodLabel(method: string, t: T) {
  const known = t(`dash.method.${method}` as TKey)
  if (known && known !== `dash.method.${method}`) return known
  const k = method.toLowerCase()
  if (COIN[k]) return COIN[k]
  const words = method.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : method
}

// One icon per meaning (never the same icon for money in and money out), with
// a quiet tint; the label and the signed amount carry the meaning too.
export function TxIcon({ type, tx }: { type: string; tx?: Tx }) {
  const c = tx ? txCategory(tx) : txCategory({ type })
  const [I, tone] = c === 'deposit' ? [IconArrowDown, 'text-emerald-300 border-emerald-500/25 bg-emerald-500/[.07]']
    : c === 'profit' ? [IconTrend, 'text-emerald-300 border-emerald-500/25 bg-emerald-500/[.07]']
    : c === 'withdrawal' ? [IconArrowUp, 'text-fg-muted border-ink-700 bg-ink-800']
    : c === 'fee' ? [IconFile, 'text-amber-300 border-amber-500/25 bg-amber-500/[.06]']
    : c === 'investment' ? [IconPie, 'text-sky-300 border-sky-500/25 bg-sky-500/[.06]']
    : c === 'account_debit' ? [IconWallet, 'text-rose-300 border-rose-500/25 bg-rose-500/[.06]']
    : c === 'loyalty_reward' || c === 'promotional_credit' ? [IconCheck, 'text-violet-300 border-violet-500/25 bg-violet-500/[.07]']
    : c === 'profit_correction' || c === 'reconciliation' || c === 'profit_adjustment' ? [IconSliders, 'text-fg-muted border-ink-700 bg-ink-800']
    : c === 'reversal' ? [IconHistory, 'text-fg-muted border-ink-700 bg-ink-800']
    : [IconSwap, 'text-fg-muted border-ink-700 bg-ink-800']
  return (
    <span className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${tone}`} data-tx-category={c} aria-hidden="true">
      <I width={16} height={16} />
    </span>
  )
}

// Signed amount text: "+$500.00" / "−$120.00" / "$0.00" (no sign when neutral).
export function signedAmount(tx: Tx) {
  const s = txSign(tx)
  return `${s > 0 ? '+' : s < 0 ? '−' : ''}$${fmt(Number(tx.amount))}`
}

// One page intro for every client page: the same title size and muted
// subtitle as Deposit / Withdraw / Wallet, so no page starts differently.
export function PageIntro({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5" data-page-intro>
      <h2 className="text-[22px] font-semibold tracking-tight text-fg [text-wrap:balance] break-normal hyphens-none">{title}</h2>
      {sub && <p className="mt-0.5 text-[14px] text-fg-muted max-w-2xl">{sub}</p>}
    </header>
  )
}

// Settings-style grouping: a small section title over one quiet surface of
// divided rows (instead of one card per item). `danger` tints the surface for
// destructive actions.
export function SettingsSection({ title, children, danger, id }: { title: string; children: ReactNode; danger?: boolean; id?: string }) {
  return (
    <section aria-labelledby={id} data-settings-section>
      <h3 id={id} className="dep-h mb-2.5">{title}</h3>
      <div className={`dep-surface !p-0 overflow-hidden divide-y ${danger ? 'divide-red-500/15 !border-red-500/25 bg-red-500/[.035]' : 'divide-[rgb(var(--contrast)/.07)]'}`}>{children}</div>
    </section>
  )
}
export function SettingsRow({ label, value, sub, action }: { label: string; value?: ReactNode; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 min-h-[52px]">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-fg-muted">{label}</p>
        {sub && <p className="mt-0.5 text-[12.5px] text-fg-faint">{sub}</p>}
      </div>
      {value !== undefined && <div className="text-[14px] text-fg text-right min-w-0 break-words max-w-[60%]">{value}</div>}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-sm text-fg">{title}</p>
      {body && <p className="text-[13px] text-fg-faint mt-1">{body}</p>}
    </div>
  )
}

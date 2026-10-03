'use client'

// Types and small display helpers shared by the dashboard sections.
import { IconArrowDown, IconArrowUp, IconSwap } from '@/components/Icons'
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
  // Stored 'adjustment' and legacy 'return' records are shown as Profit; the
  // stored rows are left untouched (direction still decides the sign).
  if (tx.type === 'adjustment' || tx.type === 'return') return t('dash.txType.profit')
  // Tarafab's own service fees are always named as such, never as a network fee.
  if (tx.type === 'fee' && tx.method === 'service_fee') return t('dash.txType.serviceFee')
  return t(`dash.txType.${tx.type}` as TKey) || tx.type.replace(/_/g, ' ')
}

export function methodLabel(method: string, t: T) {
  return t(`dash.method.${method}` as TKey) || method.replace(/_/g, ' ')
}

export function TxIcon({ type }: { type: string }) {
  const I = type === 'deposit' ? IconArrowDown : type === 'withdrawal' ? IconArrowUp : IconSwap
  return (
    <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-fg-muted shrink-0">
      <I width={16} height={16} />
    </span>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm text-fg">{title}</p>
      {body && <p className="text-[13px] text-fg-faint mt-1">{body}</p>}
    </div>
  )
}

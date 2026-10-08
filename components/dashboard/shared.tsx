'use client'

import type { ReactNode } from 'react'

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

export function TxIcon({ type }: { type: string }) {
  const I = type === 'deposit' ? IconArrowDown : type === 'withdrawal' ? IconArrowUp : IconSwap
  return (
    <span className="w-8 h-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-fg-muted shrink-0">
      <I width={16} height={16} />
    </span>
  )
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

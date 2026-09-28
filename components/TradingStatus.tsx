'use client'

import { useState } from 'react'
import { IconInfo } from '@/components/Icons'

export type TradingStatusValue = 'active' | 'inactive' | null | undefined

interface Props {
  status: TradingStatusValue
  strategyName?: string | null
  updatedAt?: string | null
}

// The status is read from the account record (accounts.trading_status) and
// set by an administrator. No automated trading engine is connected, so the
// wording describes portfolio monitoring rather than trades being executed.
const CONFIG = {
  active: {
    dot: 'bg-emerald-400',
    label: 'Portfolio monitoring active',
    text: 'text-emerald-300',
    shell: 'border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,.10),rgba(16,185,129,0)_55%)]',
    summary: 'Your portfolio is under active review by our team.',
    detail: 'This status is recorded on your account by our team. It does not mean trades are being placed automatically. Any change to your balances appears in your transaction history with its own reference number.',
    animate: true,
  },
  inactive: {
    dot: 'bg-fg-faint',
    label: 'Portfolio monitoring inactive',
    text: 'text-fg',
    shell: '',
    summary: 'No active strategy is assigned to this account right now.',
    detail: 'Your balances change only through deposits and withdrawals you submit, once they are reviewed and approved, or through entries shown in your transaction history.',
    animate: false,
  },
  unavailable: {
    dot: 'bg-amber-400',
    label: 'Status unavailable',
    text: 'text-amber-300',
    shell: 'border-amber-500/25',
    summary: 'We could not read the current status for this account.',
    detail: 'This does not affect your balances or transaction history. Refresh the page, or contact support if this continues.',
    animate: false,
  },
} as const

export function TradingStatusCard({ status, strategyName, updatedAt }: Props) {
  const [open, setOpen] = useState(false)
  const key = status === 'active' || status === 'inactive' ? status : 'unavailable'
  const c = CONFIG[key]

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className={`panel overflow-hidden ${c.shell}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left p-5 sm:p-6"
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className={`relative flex items-center justify-center w-10 h-10 rounded-full shrink-0 border ${key === 'active' ? 'border-emerald-500/30 bg-emerald-500/10' : key === 'unavailable' ? 'border-amber-500/30 bg-amber-500/10' : 'border-ink-600 bg-ink-850'}`}>
            <span className={`relative flex h-2.5 w-2.5 rounded-full ${c.dot} ${c.animate ? 'status-glow' : ''}`}>
              {c.animate && <span className={`absolute inline-flex h-full w-full rounded-full ${c.dot} animate-ping opacity-60`} />}
            </span>
          </span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] text-fg-faint mb-0.5">Account status</div>
            <div className={`text-[16px] font-semibold ${c.text}`}>{c.label}</div>
            <div className="text-[13px] text-fg-muted line-clamp-2 mt-0.5">
              {key === 'active' && strategyName ? <>Strategy: <span className="text-fg">{strategyName}</span></> : c.summary}
            </div>
          </div>
        </div>
        <IconInfo width={18} height={18} className={`shrink-0 text-fg-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-label="Details" />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 border-t border-ink-700 space-y-4">
            <p className="text-[13px] text-fg-muted leading-relaxed">{c.detail}</p>
            <dl className="grid grid-cols-2 gap-px bg-ink-700 border border-ink-700 rounded-md overflow-hidden text-[13px]">
              <div className="bg-ink-900 p-3">
                <dt className="text-fg-faint text-xs mb-0.5">Strategy</dt>
                <dd className="text-fg">{key === 'active' && strategyName ? strategyName : 'None assigned'}</dd>
              </div>
              <div className="bg-ink-900 p-3">
                <dt className="text-fg-faint text-xs mb-0.5">Last updated</dt>
                <dd className="text-fg">{formattedTime ?? 'Unknown'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

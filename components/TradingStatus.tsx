'use client'

import { useState } from 'react'
import { IconInfo } from '@/components/Icons'

export type TradingStatusValue = 'active' | 'inactive' | null | undefined

interface Props {
  status: TradingStatusValue
  strategyName?: string | null
  updatedAt?: string | null
}

const CONFIG = {
  active: {
    dot: 'bg-emerald-400',
    ping: 'bg-emerald-400',
    label: 'Trading Active',
    text: 'text-emerald-400',
    summary: 'An automated strategy is currently running on this account.',
    detail: 'This reflects the live status recorded on your account. Trades, if any occur, will appear in your transaction history with a real reference number — nothing here is simulated.',
    animate: true,
  },
  inactive: {
    dot: 'bg-fg-faint',
    ping: 'bg-fg-faint',
    label: 'Trading Inactive',
    text: 'text-fg-muted',
    summary: 'No automated trading activity is currently running on this account.',
    detail: 'Your balances only change through deposits and withdrawals you submit, once they are reviewed and approved. Nothing is bought, sold, or traded on your behalf right now.',
    animate: false,
  },
  unavailable: {
    dot: 'bg-amber-400',
    ping: 'bg-amber-400',
    label: 'Status Unavailable',
    text: 'text-amber-400',
    summary: 'Unable to retrieve the current trading status for this account.',
    detail: 'We could not read a trading status from your account record. This does not affect your balances or deposit history — try refreshing the page, or contact support if this continues.',
    animate: false,
  },
} as const

export function TradingStatusCard({ status, strategyName, updatedAt }: Props) {
  const [open, setOpen] = useState(false)
  const key = status === 'active' || status === 'inactive' ? status : 'unavailable'
  const c = CONFIG[key]

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="panel p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {c.animate && (
              <span className={`absolute inline-flex h-full w-full rounded-full ${c.ping} animate-ping opacity-60`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
          </span>
          <div className="min-w-0">
            <div className={`text-[15px] font-semibold ${c.text}`}>{c.label}</div>
            <div className="text-[13px] text-fg-faint line-clamp-2">{c.summary}</div>
          </div>
        </div>
        <IconInfo width={17} height={17} className={`shrink-0 text-fg-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pt-4 mt-4 border-t border-ink-700 space-y-3">
            <p className="text-[13px] text-fg-muted leading-relaxed">{c.detail}</p>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-fg-faint text-xs mb-0.5">Strategy</dt>
                <dd className="text-fg">{key === 'active' && strategyName ? strategyName : 'None'}</dd>
              </div>
              <div>
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

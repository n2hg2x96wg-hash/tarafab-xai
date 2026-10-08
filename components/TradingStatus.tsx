'use client'

import { useState } from 'react'
import { IconInfo } from '@/components/Icons'
import { useI18n } from '@/lib/i18n/I18nProvider'

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
    label: 'trading.activeLabel',
    text: 'text-emerald-300',
    shell: 'border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,.10),rgba(16,185,129,0)_55%)]',
    summary: 'trading.activeSummary',
    detail: 'trading.activeDetail',
    animate: true,
  },
  inactive: {
    dot: 'bg-fg-faint',
    label: 'trading.inactiveLabel',
    text: 'text-fg',
    shell: '',
    summary: 'trading.inactiveSummary',
    detail: 'trading.inactiveDetail',
    animate: false,
  },
  unavailable: {
    dot: 'bg-amber-400',
    label: 'trading.unavailableLabel',
    text: 'text-amber-300',
    shell: 'border-amber-500/25',
    summary: 'trading.unavailableSummary',
    detail: 'trading.unavailableDetail',
    animate: false,
  },
} as const

export function TradingStatusCard({ status, strategyName, updatedAt }: Props) {
  const [open, setOpen] = useState(false)
  const { t, intl } = useI18n()
  const key = status === 'active' || status === 'inactive' ? status : 'unavailable'
  const c = CONFIG[key]

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleString(intl, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className={`panel overflow-hidden ${c.shell}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`relative flex items-center justify-center w-8 h-8 rounded-full shrink-0 border ${key === 'active' ? 'border-emerald-500/30 bg-emerald-500/10' : key === 'unavailable' ? 'border-amber-500/30 bg-amber-500/10' : 'border-ink-600 bg-ink-850'}`}>
            <span className={`relative flex h-2.5 w-2.5 rounded-full ${c.dot} ${c.animate ? 'status-glow' : ''}`}>
              {c.animate && <span className={`absolute inline-flex h-full w-full rounded-full ${c.dot} animate-ping opacity-60`} />}
            </span>
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">{t('trading.accountStatus')}</div>
            <div className={`text-[15px] font-semibold ${c.text} truncate`}>{t(c.label)}</div>
            <div className="text-[12.5px] text-fg-muted truncate">
              {key === 'active' && strategyName ? <>{t('trading.strategy')}: <span className="text-fg">{strategyName}</span></> : t(c.summary)}
            </div>
          </div>
        </div>
        <IconInfo width={18} height={18} className={`shrink-0 text-fg-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-label={t('trading.details')} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3.5 border-t border-ink-700 space-y-3.5">
            <p className="text-[13px] text-fg-muted leading-relaxed">{t(c.detail)}</p>
            <dl className="grid grid-cols-2 gap-px bg-ink-700 border border-ink-700 rounded-md overflow-hidden text-[13px]">
              <div className="bg-ink-900 p-3">
                <dt className="text-fg-faint text-xs mb-0.5">{t('trading.strategy')}</dt>
                <dd className="text-fg">{key === 'active' && strategyName ? strategyName : t('trading.noneAssigned')}</dd>
              </div>
              <div className="bg-ink-900 p-3">
                <dt className="text-fg-faint text-xs mb-0.5">{t('trading.lastUpdated')}</dt>
                <dd className="text-fg">{formattedTime ?? t('common.unknown')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

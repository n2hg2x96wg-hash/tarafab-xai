'use client'

import Link from 'next/link'
import { useCallback, useRef, type ReactNode } from 'react'
import { IconAlert, IconEye, IconEyeOff, IconLock, Logo } from '@/components/Icons'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Shared frame for sign-in, registration and password recovery, so all four
// read as one part of the product: the landing page's ambient light behind a
// single frosted card, with a plain statement of how sign-in is protected.
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="site relative min-h-screen bg-ink-950 text-fg flex flex-col overflow-hidden">
      <div className="hero-light" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />

      <header className="relative z-30 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700/70 glass-bar safe-top">
        <Link href="/" aria-label={t('common.home')} className="rounded-md"><Logo /></Link>
        <div className="flex items-center gap-2">
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[420px]">
          <div className="glass-panel rounded-2xl p-6 sm:p-8 rise-in">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-fg">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-fg-muted rise-in" style={{ ['--i' as string]: 1 }}>{footer}</div>}

          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-fg-faint rise-in" style={{ ['--i' as string]: 2 }}>
            <IconLock width={13} height={13} aria-hidden="true" />
            <span>{t('trust.access')} · {t('trust.accessSub')}</span>
          </p>
        </div>
      </main>
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="alert alert-danger rise-in">
      <IconAlert className="shrink-0 mt-px" width={16} height={16} />
      <span>{message}</span>
    </div>
  )
}

export function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden="true" />
}

// Password field with a show/hide control. Visibility can be shared between
// two fields (password and confirmation) by passing it in.
export function PasswordInput({ id, value, onChange, autoComplete, disabled, visible, onToggle, invalid, describedBy }: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  disabled?: boolean
  visible: boolean
  onToggle: () => void
  invalid?: boolean
  describedBy?: string
}) {
  const { t } = useI18n()
  const Icon = visible ? IconEyeOff : IconEye
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        className={`field pr-12 ${invalid ? 'field-error' : ''}`}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-md flex items-center justify-center text-fg-faint hover:text-fg transition-colors"
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        aria-pressed={visible}
      >
        <Icon width={18} height={18} />
      </button>
    </div>
  )
}

// Runs one submission at a time. A disabled button only takes effect after
// React re-renders, so a quick double tap could otherwise start the same
// request twice; this closes that gap synchronously.
export function useSingleFlight() {
  const busy = useRef(false)
  return useCallback(async (fn: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    try { await fn() } finally { busy.current = false }
  }, [])
}

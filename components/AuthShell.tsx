'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconAlert, IconCheck, IconEye, IconEyeOff, IconHistory, IconInfo, IconLock, IconMail, IconShield, Logo } from '@/components/Icons'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Shared frame for sign-in, registration and password recovery, so all four
// read as one part of the product: the landing page's gold backdrop and
// ambient light behind a single frosted card, with a plain statement of how
// sign-in is protected. On wide screens a short brand column sits beside the
// card (copy only, no figures), so the page is not one small box in a void.
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n()
  const points: [typeof IconShield, string, string][] = [
    [IconShield, t('trust.review'), t('trust.reviewSub')],
    [IconHistory, t('trust.audit'), t('trust.auditSub')],
    [IconLock, t('trust.access'), t('trust.accessSub')],
  ]
  return (
    <div className="site auth relative min-h-screen bg-ink-950 text-fg flex flex-col overflow-hidden">
      <div className="hero-light" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />
      <div className="auth-backdrop" aria-hidden="true" />

      <header className="relative z-30 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700/70 glass-bar safe-top">
        <Link href="/" aria-label={t('common.home')} className="rounded-md auth-brand"><Logo /></Link>
        <div className="flex items-center gap-2">
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-4 pt-8 sm:py-12 chat-clearance">
        <div className="w-full max-w-[420px] lg:max-w-[1040px] lg:grid lg:grid-cols-[1fr_420px] lg:gap-16 lg:items-center">
          <aside className="hidden lg:block rise-in" data-auth-aside>
            <p className="lp-eyebrow mb-3">Tarafab.XAi</p>
            <p className="text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-fg [text-wrap:balance]">{t('landing.growTitle1')} <span className="text-accent">{t('landing.growTitle2')}</span></p>
            <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-fg-muted">{t('landing.growBody')}</p>
            <ul className="mt-8 max-w-md auth-points">
              {points.map(([Icon, k, sub]) => (
                <li key={k} className="flex items-center gap-3.5 py-3.5">
                  <span className="auth-point-icon" aria-hidden="true"><Icon width={17} height={17} /></span>
                  <span className="min-w-0"><span className="block text-[14.5px] font-medium text-fg">{k}</span><span className="block text-[13px] text-fg-faint">{sub}</span></span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0">
            <div className="auth-card rise-in" data-chat-avoid>
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-fg">{title}</h1>
              {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{subtitle}</p>}
              <div className="mt-7">{children}</div>
            </div>

            {footer && <div className="mt-5 text-center text-sm text-fg-muted rise-in" style={{ ['--i' as string]: 1 }}>{footer}</div>}

            <p className="mt-6 flex lg:hidden items-center justify-center gap-2 text-xs text-fg-faint rise-in" style={{ ['--i' as string]: 2 }}>
              <IconLock width={13} height={13} aria-hidden="true" />
              <span>{t('trust.access')} · {t('trust.accessSub')}</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  return <Notice tone="danger" icon={IconAlert} role="alert">{message}</Notice>
}

// One notice style for every authentication message: a solid tinted
// surface, an icon, an optional title and body, and an optional action.
type NoticeIcon = (p: { width?: number; height?: number; className?: string }) => ReactNode
export function Notice({ tone, icon: Icon, title, children, action, role = 'status', ...rest }: {
  tone: 'warning' | 'danger' | 'success' | 'info'
  icon: NoticeIcon
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  role?: 'status' | 'alert'
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div role={role} className={`auth-notice is-${tone} rise-in`} {...rest}>
      <span className="auth-notice-icon" aria-hidden="true"><Icon width={17} height={17} /></span>
      <div className="min-w-0 flex-1">
        {title && <p className="auth-notice-title">{title}</p>}
        {children && <div className={title ? 'auth-notice-body' : 'auth-notice-text'}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}

// Inline message under a field (linked with aria-describedby).
export function FieldError({ id, message }: { id: string; message: string }) {
  return <p id={id} className="field-error-text" role="alert">{message}</p>
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

// "4:58" for a number of seconds.
export const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`

// Temporary sign-in restriction reported by the server (HTTP 429 with the
// exact seconds left). The server enforces it; this only shows it. The end
// time is kept for this browser tab so a refresh keeps showing the same
// countdown; a new attempt after it ends is checked by the server again.
const LOCK_KEY = 'tarafab.authLock'
export function useAuthLock(scope: string) {
  const key = `${LOCK_KEY}.${scope}`
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    try { const v = Number(sessionStorage.getItem(key) || 0); if (v > Date.now()) setUntil(v) } catch { /* storage blocked */ }
  }, [key])
  useEffect(() => {
    if (!until) return
    const tick = () => {
      const n = Date.now(); setNow(n)
      if (n >= until) { setUntil(0); try { sessionStorage.removeItem(key) } catch { /* ignore */ } }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [until, key])
  const lock = (seconds: number) => {
    const u = Date.now() + seconds * 1000
    setUntil(u); setNow(Date.now())
    try { sessionStorage.setItem(key, String(u)) } catch { /* ignore */ }
  }
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
  return { locked: left > 0, left, lock }
}

export function LockoutNotice({ seconds, title, body }: { seconds: number | null; title: string; body: string }) {
  const { t } = useI18n()
  return (
    <Notice tone="warning" icon={IconHistory} title={title} data-lockout={seconds ?? 'unknown'}>
      {seconds != null
        ? <>{body} <span className="whitespace-nowrap">{t('authx.tryAgainIn')} <strong className="tabular-nums font-semibold text-fg" aria-live="off">{clockText(seconds)}</strong>.</span></>
        : body}
    </Notice>
  )
}

// "Resend confirmation email" for an address that has not been confirmed.
// One request at a time; after a send it waits 60 seconds before another
// (the server limits it per address and per IP as well).
export function ResendVerification({ email, variant = 'link' }: { email: string; variant?: 'link' | 'button' }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limited'>('idle')
  const [msg, setMsg] = useState('')
  const lock = useAuthLock('resend')
  const once = useSingleFlight()
  const send = () => once(async () => {
    setState('sending'); setMsg('')
    try {
      const r = await fetch('/api/auth/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setState('sent'); lock.lock(60); return }
      if (r.status === 429) { setState('limited'); if (typeof d.retryAfter === 'number') lock.lock(d.retryAfter); setMsg(t('authx.resendLimited')); return }
      setState('failed'); setMsg(typeof d.error === 'string' ? d.error : t('authx.resendFailed'))
    } catch { setState('failed'); setMsg(t('errors.network')) }
  })
  const label = state === 'sending' ? <><Spinner />{t('authx.resending')}</>
    : lock.locked ? <>{t('authx.resendIn', { time: clockText(lock.left) })}</>
    : t('authx.resend')
  return (
    <div data-resend={state}>
      <button type="button" onClick={send} disabled={state === 'sending' || lock.locked} aria-busy={state === 'sending'}
        className={variant === 'button' ? 'btn btn-outline w-full gap-2' : 'auth-link-btn'} data-resend-btn>{label}</button>
      {state === 'sent' && <p className="auth-inline-ok" role="status"><IconCheck width={14} height={14} aria-hidden="true" />{t('authx.resendSent', { email: email.trim() })}</p>}
      {(state === 'failed' || state === 'limited') && <p className="field-error-text" role="alert">{msg}</p>}
    </div>
  )
}

export { IconMail, IconInfo }

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
        className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-[10px] flex items-center justify-center text-fg-faint hover:text-fg hover:bg-[rgb(var(--contrast)/.05)] transition-colors"
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

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { IconAlert } from '@/components/Icons'
import { createClient } from '@/lib/supabase/client'
import {
  AuthShell, FieldError, FormError, IconInfo, IconMail, LockoutNotice, Notice, PasswordInput, ResendVerification, Spinner,
  isEmail, useAuthLock, useSingleFlight,
} from '@/components/AuthShell'

// What the last attempt ran into, shown as one notice above the form.
type Problem = null
  | { kind: 'error'; message: string; attemptsLeft?: number }
  | { kind: 'unverified'; email: string }
  | { kind: 'limited-unknown' } // Supabase's own limit: no timing is given

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({})
  // Arrived here because the session could not be renewed (see SESSION_EXPIRED).
  const [expired, setExpired] = useState(false)
  useEffect(() => { setExpired(new URLSearchParams(window.location.search).get('expired') === '1') }, [])
  const lock = useAuthLock('signin')
  const emailRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const once = useSingleFlight()

  const validate = () => {
    const f: typeof fieldErr = {}
    if (!email.trim()) f.email = t('authx.errEmail')
    else if (!isEmail(email)) f.email = t('authx.errEmailFormat')
    if (!password) f.password = t('authx.errPassword')
    setFieldErr(f)
    if (f.email) emailRef.current?.focus()
    else if (f.password) document.getElementById('password')?.focus()
    return !f.email && !f.password
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (lock.locked) return
    return once(async () => {
      setProblem(null)
      if (!validate()) return
      setLoading(true)
      try {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 429) {
            // Exact time left when the server knows it; otherwise no timer.
            if (typeof data.retryAfter === 'number' && data.retryAfter > 0) lock.lock(data.retryAfter)
            else setProblem({ kind: 'limited-unknown' })
            return
          }
          const msg = String(data.error || '')
          if (data.code === 'EMAIL_NOT_CONFIRMED' || /email not confirmed/i.test(msg)) setProblem({ kind: 'unverified', email: email.trim() })
          else if (data.code === 'INVALID_CREDENTIALS' || /invalid login|credentials/i.test(msg)) setProblem({ kind: 'error', message: t('authx.wrongCredentials'), attemptsLeft: typeof data.attemptsLeft === 'number' ? data.attemptsLeft : undefined })
          else if (res.status >= 500) setProblem({ kind: 'error', message: t('authx.serverDown') })
          else setProblem({ kind: 'error', message: msg || t('auth.signInFailed') })
          return
        }
        if (data.access_token && data.refresh_token) {
          // Never continue to the dashboard without a stored session (it would bounce straight back here).
          const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
          if (sessionError) { setProblem({ kind: 'error', message: t('errors.network') }); return }
        }
        // Only a dashboard section name is accepted as the return target.
        const next = new URLSearchParams(window.location.search).get('next') || ''
        router.push(data.role === 'admin' ? '/admin' : /^[a-zA-Z]{2,32}$/.test(next) ? `/dashboard#${next}` : '/dashboard')
      } catch {
        setProblem({ kind: 'error', message: t('errors.network') })
      } finally {
        setLoading(false)
      }
    })
  }

  return (
    <AuthShell
      title={t('common.signIn')}
      subtitle={t('auth.signInSubtitle')}
      footer={<>{t('auth.noAccount')} <Link href="/sign-up" className="auth-footer-link">{t('common.openAccount')}</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate data-signin-form>
        {lock.locked ? (
          <LockoutNotice seconds={lock.left} title={t('authx.lockTitle')} body={t('authx.lockBody')} />
        ) : problem?.kind === 'limited-unknown' ? (
          <LockoutNotice seconds={null} title={t('authx.lockTitle')} body={t('authx.lockBodyUnknown')} />
        ) : problem?.kind === 'unverified' ? (
          <Notice tone="warning" icon={IconMail} title={t('authx.verifyTitle')} data-unverified
            action={<ResendVerification email={problem.email} />}>
            {t('authx.verifyBody', { email: problem.email })}
          </Notice>
        ) : problem?.kind === 'error' ? (
          // From the third wrong password on, the attempts left before the pause.
          problem.attemptsLeft != null && problem.attemptsLeft > 0 && problem.attemptsLeft <= 2 ? (
            <Notice tone="danger" icon={IconAlert} role="alert" data-attempts-left={String(problem.attemptsLeft)}>
              {problem.message}
              <span className="block mt-1.5 font-semibold">{problem.attemptsLeft === 1 ? t('authx.attemptsLeftOne') : t('authx.attemptsLeftMany', { n: problem.attemptsLeft })}</span>
            </Notice>
          ) : <FormError message={problem.message} />
        ) : expired ? (
          <Notice tone="info" icon={IconInfo} data-session-expired>{t('authx.sessionEnded')}</Notice>
        ) : null}

        <div>
          <label htmlFor="email" className="field-label">{t('common.email')}</label>
          <input ref={emailRef} id="email" type="email" inputMode="email" value={email}
            onChange={e => { setEmail(e.target.value); if (fieldErr.email) setFieldErr(f => ({ ...f, email: undefined })) }}
            required autoComplete="email" className={`field ${fieldErr.email ? 'field-error' : ''}`} disabled={loading}
            aria-invalid={fieldErr.email ? true : undefined} aria-describedby={fieldErr.email ? 'email-error' : undefined} />
          {fieldErr.email && <FieldError id="email-error" message={fieldErr.email} />}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 mb-1.5">
            <label htmlFor="password" className="field-label !mb-0">{t('common.password')}</label>
            <Link href="/forgot-password" className="auth-quiet-link">{t('auth.forgot')}</Link>
          </div>
          <PasswordInput id="password" value={password} onChange={v => { setPassword(v); if (fieldErr.password) setFieldErr(f => ({ ...f, password: undefined })) }}
            autoComplete="current-password" disabled={loading} visible={showPassword} onToggle={() => setShowPassword(s => !s)}
            invalid={!!fieldErr.password} describedBy={fieldErr.password ? 'password-error' : undefined} />
          {fieldErr.password && <FieldError id="password-error" message={fieldErr.password} />}
        </div>

        <button type="submit" disabled={loading || lock.locked} className="btn btn-solid w-full min-h-12" aria-busy={loading} data-signin-submit>
          {loading ? <><Spinner />{t('auth.signingIn')}</> : t('common.signIn')}
        </button>
      </form>
    </AuthShell>
  )
}

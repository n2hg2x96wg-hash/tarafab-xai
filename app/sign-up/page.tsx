'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FieldError, FormError, IconMail, LockoutNotice, Notice, PasswordInput, ResendVerification, Spinner, isEmail, useAuthLock, useSingleFlight } from '@/components/AuthShell'
import { PhoneInput } from '@/components/PhoneInput'
import { guessCountry, normalizePhone } from '@/lib/phone'

function passwordStrength(pw: string): { score: number; label: TKey; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'auth.strengthWeak' as TKey, color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'auth.strengthFair' as TKey, color: 'bg-amber-500' }
  if (score === 4) return { score, label: 'auth.strengthGood' as TKey, color: 'bg-emerald-600' }
  return { score, label: 'auth.strengthStrong' as TKey, color: 'bg-emerald-500' }
}

export default function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  // Required contact number: country calling code + number (no SMS, no codes).
  const [phoneCountry, setPhoneCountry] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [password, setPassword] = useState('')
  // Bot checks (invisible to people): a field only automated scripts fill in,
  // and how long the form has been open when it is sent.
  const [extra, setExtra] = useState('')
  const openedAt = useRef(Date.now())
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Two separate statements, both unticked until the person ticks them.
  const [ageOk, setAgeOk] = useState(false)
  const [riskOk, setRiskOk] = useState(false)
  const [consentTried, setConsentTried] = useState(false)
  const ageRef = useRef<HTMLInputElement>(null)
  const riskRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Inline messages under the field they belong to.
  const [fieldErr, setFieldErr] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({})
  const clearField = (k: keyof typeof fieldErr) => setFieldErr(f => (f[k] ? { ...f, [k]: undefined } : f))
  const lock = useAuthLock('signup')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const strength = passwordStrength(password)
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password
  const once = useSingleFlight()
  // Preselect the country from the browser language (en-NG → +234).
  useEffect(() => { setPhoneCountry(c => c || guessCountry()) }, [])
  const phoneMessage = (e: 'missing' | 'country' | 'invalid') =>
    t(e === 'missing' ? 'auth.errPhone' : e === 'country' ? 'auth.errPhoneCountry' : 'auth.errPhoneInvalid')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    return once(async () => {
      setError('')
      if (lock.locked) return

      const f: typeof fieldErr = {}
      if (!fullName.trim()) f.name = t('auth.errName')
      if (!email.trim()) f.email = t('authx.errEmail')
      else if (!isEmail(email)) f.email = t('authx.errEmailFormat')
      const ph = normalizePhone(phone, phoneCountry)
      if (password.length < 8) f.password = t('auth.errLength')
      else if (password.replace(/[^\x20-\x7E]/g, '') !== password) f.password = t('auth.errChars')
      if (!f.password && password !== confirmPassword) f.confirm = t('auth.errMatch')
      setFieldErr(f)
      setPhoneError(ph.ok ? '' : phoneMessage(ph.error))
      if (!ageOk || !riskOk) setConsentTried(true)
      const first = f.name ? 'name' : f.email ? 'email' : !ph.ok ? 'phone' : f.password ? 'password' : f.confirm ? 'confirm' : null
      if (first) { document.getElementById(first)?.focus(); return }
      if (!ageOk || !riskOk) { (!ageOk ? ageRef : riskRef).current?.focus(); return }

      const cleanEmail = email.trim().replace(/[^\x20-\x7E]/g, '')

      setLoading(true)
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, fullName: fullName.trim(), phone, phoneCountry, consent: { age: ageOk, risk: riskOk }, extra, formMs: Date.now() - openedAt.current }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // The server checks the number with the same rules.
          if (data.field === 'phone') { setPhoneError(phoneMessage(data.code === 'missing' || data.code === 'country' ? data.code : 'invalid')); document.getElementById('phone')?.focus(); return }
          if (res.status === 429) {
            if (typeof data.retryAfter === 'number' && data.retryAfter > 0) lock.lock(data.retryAfter)
            else setError(t('authx.signupLimitedUnknown'))
            return
          }
          const msg: string = data.error || t('auth.signUpFailed')
          setError(msg.toLowerCase().includes('already registered') ? t('auth.errExists') : res.status >= 500 ? t('authx.serverDown') : msg)
          return
        }
        if (data.needsVerification) {
          setSuccess(true)
        } else if (data.access_token && data.refresh_token) {
          await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
          router.push('/dashboard')
        }
      } catch {
        setError(t('errors.network'))
      } finally {
        setLoading(false)
      }
    })
  }

  if (success) {
    return (
      <AuthShell title={t('auth.checkEmail')} subtitle={t('auth.sentConfirm', { email: email.trim() })}>
        <Notice tone="warning" icon={IconMail} title={t('authx.verifyTitle')} data-signup-sent>{t('auth.sentConfirmBody')}</Notice>
        <Link href="/sign-in" className="btn btn-solid w-full mt-6">{t('auth.goToSignIn')}</Link>
        <div className="mt-4 text-center text-sm text-fg-muted">
          <span>{t('authx.noEmail')} </span><ResendVerification email={email} />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('common.openAccount')}
      subtitle={t('auth.signUpSubtitle')}
      footer={<>{t('auth.haveAccount')} <Link href="/sign-in" className="auth-footer-link">{t('common.signIn')}</Link>
        <span className="block mt-2"><Link href="/privacy" className="text-fg-muted underline underline-offset-4 hover:text-fg" data-privacy-link>{t('landing.footer.privacy')}</Link></span></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {lock.locked ? <LockoutNotice seconds={lock.left} title={t('authx.signupLockTitle')} body={t('authx.signupLockBody')} />
          : error ? <FormError message={error} /> : null}
        <div aria-hidden="true" className="absolute -left-[10000px] top-auto w-px h-px overflow-hidden">
          <label htmlFor="su-extra">Leave this field empty</label>
          <input id="su-extra" name="company_website_extra" type="text" tabIndex={-1} autoComplete="off" value={extra} onChange={e => setExtra(e.target.value)} />
        </div>

        <div>
          <label htmlFor="name" className="field-label">{t('common.fullName')}</label>
          <input id="name" type="text" value={fullName} onChange={e => { setFullName(e.target.value); clearField('name') }} required autoComplete="name"
            className={`field ${fieldErr.name ? 'field-error' : ''}`} disabled={loading} aria-invalid={fieldErr.name ? true : undefined} aria-describedby={fieldErr.name ? 'name-error' : undefined} />
          {fieldErr.name && <FieldError id="name-error" message={fieldErr.name} />}
        </div>

        <div>
          <label htmlFor="email" className="field-label">{t('common.email')}</label>
          <input id="email" type="email" inputMode="email" value={email} onChange={e => { setEmail(e.target.value); clearField('email') }} required autoComplete="email"
            className={`field ${fieldErr.email ? 'field-error' : ''}`} disabled={loading} aria-invalid={fieldErr.email ? true : undefined} aria-describedby={fieldErr.email ? 'email-error' : undefined} />
          {fieldErr.email && <FieldError id="email-error" message={fieldErr.email} />}
        </div>

        <div>
          <label htmlFor="phone" className="field-label">{t('auth.phone')}</label>
          <PhoneInput id="phone" country={phoneCountry} onCountry={c => { setPhoneCountry(c); setPhoneError('') }}
            number={phone} onNumber={v => { setPhone(v); if (phoneError) setPhoneError('') }}
            disabled={loading} error={phoneError} />
        </div>

        <div>
          <label htmlFor="password" className="field-label">{t('common.password')}</label>
          <PasswordInput id="password" value={password} onChange={v => { setPassword(v); clearField('password') }} autoComplete="new-password" disabled={loading} visible={showPassword} onToggle={() => setShowPassword(s => !s)}
            invalid={!!fieldErr.password} describedBy={fieldErr.password ? 'password-error pw-help' : 'pw-help'} />
          {fieldErr.password && <FieldError id="password-error" message={fieldErr.password} />}
          <div id="pw-help" className="mt-2">
            {password ? (
              <div className="flex items-center gap-3">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-sm transition-colors ${i <= strength.score ? strength.color : 'bg-ink-700'}`} />
                  ))}
                </div>
                <span className="text-xs text-fg-muted min-w-12 text-right">{t(strength.label)}</span>
              </div>
            ) : !fieldErr.password && (
              <p className="text-xs text-fg-faint">{t('auth.atLeast8')}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="field-label">{t('auth.confirmPassword')}</label>
          <PasswordInput id="confirm" value={confirmPassword} onChange={v => { setConfirmPassword(v); clearField('confirm') }} autoComplete="new-password" disabled={loading} visible={showPassword} onToggle={() => setShowPassword(s => !s)}
            invalid={mismatch || !!fieldErr.confirm} describedBy={mismatch || fieldErr.confirm ? 'confirm-error' : undefined} />
          {(mismatch || fieldErr.confirm) && <FieldError id="confirm-error" message={fieldErr.confirm || t('auth.mismatch')} />}
        </div>

        <fieldset className="consent" data-consent>
          <legend className="sr-only">{t('auth.consentLegend')}</legend>
          <ConsentBox id="consent-age" inputRef={ageRef} checked={ageOk} onChange={setAgeOk} disabled={loading} text={t('auth.consentAge')} error={consentTried && !ageOk ? t('auth.errConsentAge') : ''} />
          <ConsentBox id="consent-risk" inputRef={riskRef} checked={riskOk} onChange={setRiskOk} disabled={loading} text={t('auth.consentRisk')} error={consentTried && !riskOk ? t('auth.errConsentRisk') : ''} />
        </fieldset>

        <button type="submit" disabled={loading || lock.locked} className="btn btn-solid w-full min-h-12" aria-busy={loading} data-signup-submit>
          {loading ? <><Spinner />{t('auth.creatingAccount')}</> : t('auth.createAccount')}
        </button>
      </form>
    </AuthShell>
  )
}

// A custom-styled checkbox row: the whole row is the label, the native input
// stays in place (so keyboard, screen readers and form semantics are
// unchanged), and a missing tick shows its own message under the text.
function ConsentBox({ id, inputRef, checked, onChange, disabled, text, error }: {
  id: string
  inputRef: React.RefObject<HTMLInputElement | null>
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  text: string
  error: string
}) {
  return (
    <div className="consent-row" data-invalid={error ? '' : undefined}>
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          className="consent-box"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className="min-w-0 text-[13.5px] leading-[1.55] text-fg-muted break-words">{text}</span>
      </label>
      {error && <p id={`${id}-error`} role="alert" className="consent-error">{error}</p>}
    </div>
  )
}

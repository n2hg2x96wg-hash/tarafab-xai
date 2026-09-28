'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, PasswordInput, Spinner, useSingleFlight } from '@/components/AuthShell'

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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const strength = passwordStrength(password)
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password
  const once = useSingleFlight()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    return once(async () => {
      setError('')

      if (!fullName.trim()) { setError(t('auth.errName')); return }
      if (password.length < 8) { setError(t('auth.errLength')); return }
      if (password !== confirmPassword) { setError(t('auth.errMatch')); return }
      if (!agreed) { setError(t('auth.errAgree')); return }

      const cleanEmail = email.trim().replace(/[^\x20-\x7E]/g, '')
      if (password.replace(/[^\x20-\x7E]/g, '') !== password) {
        setError(t('auth.errChars'))
        return
      }

      setLoading(true)
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, fullName: fullName.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          const msg: string = data.error || t('auth.signUpFailed')
          setError(msg.toLowerCase().includes('already registered') ? t('auth.errExists') : msg)
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
        <p className="text-[15px] text-fg-muted leading-relaxed">
          {t('auth.sentConfirmBody')}
        </p>
        <Link href="/sign-in" className="btn btn-solid w-full mt-6">{t('auth.goToSignIn')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('common.openAccount')}
      subtitle={t('auth.signUpSubtitle')}
      footer={<>{t('auth.haveAccount')} <Link href="/sign-in" className="text-fg underline underline-offset-4 hover:text-accent">{t('common.signIn')}</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}

        <div>
          <label htmlFor="name" className="field-label">{t('common.fullName')}</label>
          <input id="name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" className="field" disabled={loading} />
        </div>

        <div>
          <label htmlFor="email" className="field-label">{t('common.email')}</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="field" disabled={loading} />
        </div>

        <div>
          <label htmlFor="password" className="field-label">{t('common.password')}</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" disabled={loading} visible={showPassword} onToggle={() => setShowPassword(s => !s)} describedBy="pw-help" />
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
            ) : (
              <p className="text-xs text-fg-faint">{t('auth.atLeast8')}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="field-label">{t('auth.confirmPassword')}</label>
          <PasswordInput id="confirm" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={loading} visible={showPassword} onToggle={() => setShowPassword(s => !s)} invalid={mismatch} describedBy={mismatch ? 'confirm-error' : undefined} />
          {mismatch && <p id="confirm-error" className="text-xs text-danger-400 mt-1.5">{t('auth.mismatch')}</p>}
        </div>

        <label className="flex items-start gap-3 cursor-pointer py-1">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={loading} className="mt-0.5 w-5 h-5 shrink-0 accent-[rgb(var(--accent))]" />
          <span className="text-sm text-fg-muted leading-relaxed">
            {t('auth.agree')}
          </span>
        </label>

        <button type="submit" disabled={loading} className="btn btn-solid w-full min-h-12" aria-busy={loading}>
          {loading ? <><Spinner />{t('auth.creatingAccount')}</> : t('auth.createAccount')}
        </button>
      </form>
    </AuthShell>
  )
}

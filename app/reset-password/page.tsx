'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, Spinner, useSingleFlight } from '@/components/AuthShell'
import { clearRecovery, inRecovery, markRecovery } from '@/lib/auth/recovery'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { t } = useI18n()

  // The form is offered only to a recovery session: one opened from a reset
  // link (our /auth/confirm page, or Supabase's own "#…&type=recovery"
  // redirect). Being signed in alone is not enough. See lib/auth/recovery.ts.
  // Read during the first render, before the Supabase client clears the address.
  const [linkError] = useState(() => typeof window !== 'undefined' && /(^#|&)error(_code)?=/.test(window.location.hash))
  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') markRecovery()
      if (session && inRecovery()) setReady('ok')
    })
    const t = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setReady(r => (r === 'ok' || (session && inRecovery() && !linkError) ? 'ok' : 'invalid'))
    }, 1500)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const once = useSingleFlight()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    return once(async () => {
      setError('')
      if (password.length < 8) { setError(t('auth.errLength')); return }
      if (password !== confirm) { setError(t('auth.errMatch')); return }
      if (password.replace(/[^\x20-\x7E]/g, '') !== password) { setError(t('auth.errCharsShort')); return }
      setLoading(true)
      try {
        const { error: err } = await createClient().auth.updateUser({ password })
        if (err) {
          // The recovery session ended (expired or signed out elsewhere).
          if (err.name === 'AuthSessionMissingError' || err.status === 401 || err.status === 403) { clearRecovery(); setReady('invalid'); return }
          setError(err.message); return
        }
        clearRecovery()
        router.push('/dashboard')
      } catch {
        setError(t('errors.network'))
      } finally {
        setLoading(false)
      }
    })
  }

  if (ready === 'checking') {
    return <AuthShell title={t('auth.newPasswordTitle')} subtitle={t('auth.checkingLink')}><div className="skeleton h-11" /></AuthShell>
  }

  if (ready === 'invalid') {
    return (
      <AuthShell title={t('auth.linkExpired')} subtitle={t('auth.linkExpiredBody')}>
        <Link href="/forgot-password" className="btn btn-solid w-full">{t('auth.sendNewLink')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.newPasswordTitle')} subtitle={t('auth.newPasswordSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}
        <div>
          <label htmlFor="password" className="field-label">{t('auth.newPassword')}</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className="field" disabled={loading} />
          <p className="text-xs text-fg-faint mt-1.5">{t('auth.atLeast8')}</p>
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">{t('auth.confirmNewPassword')}</label>
          <input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className="field" disabled={loading} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-solid w-full" aria-busy={loading}>
          {loading ? <><Spinner />{t('common.saving')}</> : t('auth.saveNewPassword')}
        </button>
      </form>
    </AuthShell>
  )
}

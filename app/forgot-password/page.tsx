'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { authReturnBase } from '@/lib/site'
import { AuthShell, FormError, Spinner, useSingleFlight } from '@/components/AuthShell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const { t } = useI18n()

  const once = useSingleFlight()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    return once(async () => {
      setError('')
      setLoading(true)
      try {
        const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${authReturnBase(window.location.origin)}/reset-password`,
        })
        // Supabase answers "too many requests", or fails to send (its default
        // email service refuses addresses outside the project team with
        // "Email address not authorized"), only for addresses that have an
        // account. Showing those would reveal which emails are registered,
        // so they get the same reply as a successful request. Other errors
        // (such as a malformed address) are still shown.
        const hidden = err && (err.status === 429 || (err.status ?? 0) >= 500 || err.code === 'email_address_not_authorized' || /not authori[sz]ed/i.test(err.message))
        if (err && !hidden) { setError(err.message); return }
        setSent(true)
      } catch {
        setError(t('errors.network'))
      } finally {
        setLoading(false)
      }
    })
  }

  if (sent) {
    return (
      <AuthShell title={t('auth.checkEmail')} subtitle={t('auth.resetSent', { email: email.trim() })}>
        <p className="text-[15px] text-fg-muted leading-relaxed">{t('auth.resetSentBody')}</p>
        <Link href="/sign-in" className="btn btn-outline w-full mt-6">{t('auth.backToSignIn')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
      footer={<Link href="/sign-in" className="text-fg underline underline-offset-4 hover:text-accent">{t('auth.backToSignIn')}</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}
        <div>
          <label htmlFor="email" className="field-label">{t('common.email')}</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="field" disabled={loading} />
        </div>
        <button type="submit" disabled={loading || !email.trim()} className="btn btn-solid w-full" aria-busy={loading}>
          {loading ? <><Spinner />{t('common.sending')}</> : t('auth.sendLink')}
        </button>
      </form>
    </AuthShell>
  )
}

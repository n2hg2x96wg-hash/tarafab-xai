'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
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
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) { setError(err.message); return }
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
        <button type="submit" disabled={loading || !email.trim()} className="btn btn-solid w-full">
          {loading ? <><Spinner />{t('common.sending')}</> : t('auth.sendLink')}
        </button>
      </form>
    </AuthShell>
  )
}

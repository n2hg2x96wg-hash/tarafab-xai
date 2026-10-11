'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, Spinner, useSingleFlight } from '@/components/AuthShell'
import { markRecovery, readRecoveryParams, type RecoveryParams } from '@/lib/auth/recovery'

// Landing page for the password-reset email (see lib/auth/recovery.ts).
// It only ever continues to /reset-password: no address from the link is
// followed, so it cannot be used as an open redirect.
export default function ConfirmRecoveryPage() {
  const [params, setParams] = useState<RecoveryParams | null | undefined>(undefined)
  const [state, setState] = useState<'ready' | 'verifying' | 'invalid'>('ready')
  const [error, setError] = useState('')
  const router = useRouter()
  const { t } = useI18n()
  const once = useSingleFlight()

  useEffect(() => {
    const found = readRecoveryParams(window.location.search, window.location.hash)
    // Take the token out of the address bar and history straight away.
    if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    setParams(found)
    if (!found) setState('invalid')
  }, [])

  const verify = () => once(async () => {
    if (!params) return
    setError('')
    setState('verifying')
    try {
      const { data, error: err } = await createClient().auth.verifyOtp({ token_hash: params.tokenHash, type: params.type })
      // A connection problem keeps the link usable; anything else means the
      // token is expired, used or not valid.
      if (err && isAuthRetryableFetchError(err)) { setError(t('errors.network')); setState('ready'); return }
      if (err || !data.session) { setState('invalid'); return }
      markRecovery()
      router.replace('/reset-password')
    } catch {
      setError(t('errors.network'))
      setState('ready')
    }
  })

  if (params === undefined) {
    return <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.checkingLink')}><div className="skeleton h-11" /></AuthShell>
  }

  if (state === 'invalid') {
    return (
      <AuthShell title={t('auth.linkExpired')} subtitle={t('auth.linkExpiredBody')}>
        <Link href="/forgot-password" className="btn btn-solid w-full">{t('auth.sendNewLink')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.confirmBody')}
      footer={<Link href="/sign-in" className="text-fg underline underline-offset-4 hover:text-accent">{t('auth.backToSignIn')}</Link>}
    >
      {error && <div className="mb-5"><FormError message={error} /></div>}
      <button type="button" onClick={verify} disabled={state === 'verifying'} className="btn btn-solid w-full" aria-busy={state === 'verifying'} data-confirm-recovery>
        {state === 'verifying' ? <><Spinner />{t('auth.checkingLink')}</> : t('auth.confirmContinue')}
      </button>
    </AuthShell>
  )
}

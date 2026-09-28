'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, Spinner } from '@/components/AuthShell'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg: string = data.error || t('auth.signInFailed')
        if (msg.toLowerCase().includes('email not confirmed')) {
          setError(t('auth.confirmEmailFirst'))
        } else if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('credentials')) {
          setError(t('auth.wrongCredentials'))
        } else {
          setError(msg)
        }
        return
      }
      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      }
      router.push(data.role === 'admin' ? '/admin' : '/dashboard')
    } catch {
      setError(t('errors.network'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('common.signIn')}
      subtitle={t('auth.signInSubtitle')}
      footer={<>{t('auth.noAccount')} <Link href="/sign-up" className="text-fg underline underline-offset-4 hover:text-accent">{t('common.openAccount')}</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}

        <div>
          <label htmlFor="email" className="field-label">{t('common.email')}</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="field" disabled={loading} />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 mb-1.5">
            <label htmlFor="password" className="field-label !mb-0">{t('common.password')}</label>
            <Link href="/forgot-password" className="text-[13px] text-fg-muted hover:text-fg">{t('auth.forgot')}</Link>
          </div>
          <div className="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className="field pr-24" disabled={loading} />
            <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-muted hover:text-fg" aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}>
              {showPassword ? t('common.hide') : t('common.show')}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || !email || !password} className="btn btn-solid w-full">
          {loading ? <><Spinner />{t('auth.signingIn')}</> : t('common.signIn')}
        </button>
      </form>
    </AuthShell>
  )
}

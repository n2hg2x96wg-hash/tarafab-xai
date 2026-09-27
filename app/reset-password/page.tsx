'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, Spinner } from '@/components/AuthShell'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady('ok')
    })
    const t = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setReady(r => (r === 'ok' || session ? 'ok' : 'invalid'))
    }, 1500)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    if (password.replace(/[^\x20-\x7E]/g, '') !== password) { setError('Use letters, numbers and standard symbols only.'); return }
    setLoading(true)
    try {
      const { error: err } = await createClient().auth.updateUser({ password })
      if (err) { setError(err.message); return }
      router.push('/dashboard')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (ready === 'checking') {
    return <AuthShell title="Set a new password" subtitle="Checking your reset link"><div className="skeleton h-11" /></AuthShell>
  }

  if (ready === 'invalid') {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once and expire after a short time.">
        <Link href="/forgot-password" className="btn btn-solid w-full">Send a new link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a password you have not used here before.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}
        <div>
          <label htmlFor="password" className="field-label">New password</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className="field" disabled={loading} />
          <p className="text-xs text-fg-faint mt-1.5">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">Confirm new password</label>
          <input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className="field" disabled={loading} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-solid w-full">
          {loading ? <><Spinner />Saving</> : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  )
}

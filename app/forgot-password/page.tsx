'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FormError, Spinner } from '@/components/AuthShell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) { setError(err.message); return }
      setSent(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`If an account exists for ${email.trim()}, we sent it a link to set a new password.`}>
        <p className="text-[15px] text-fg-muted leading-relaxed">The link can only be used once. If it has not arrived after a few minutes, check your spam folder.</p>
        <Link href="/sign-in" className="btn btn-outline w-full mt-6">Back to sign in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we will send you a reset link."
      footer={<Link href="/sign-in" className="text-fg underline underline-offset-4 hover:text-accent">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="field" disabled={loading} />
        </div>
        <button type="submit" disabled={loading || !email.trim()} className="btn btn-solid w-full">
          {loading ? <><Spinner />Sending</> : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  )
}

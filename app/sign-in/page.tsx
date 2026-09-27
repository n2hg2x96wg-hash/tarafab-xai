'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
        const msg: string = data.error || 'Sign in failed'
        if (msg.toLowerCase().includes('email not confirmed')) {
          setError('Please confirm your email first. Check your inbox for the confirmation link.')
        } else if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('credentials')) {
          setError('Incorrect email or password.')
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
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email and password you registered with."
      footer={<>No account yet? <Link href="/sign-up" className="text-fg underline underline-offset-4 hover:text-accent">Open an account</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormError message={error} />}

        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="field" disabled={loading} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="field-label !mb-0">Password</label>
            <Link href="/forgot-password" className="text-[13px] text-fg-muted hover:text-fg">Forgot password?</Link>
          </div>
          <div className="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className="field pr-16" disabled={loading} />
            <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-muted hover:text-fg" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || !email || !password} className="btn btn-solid w-full">
          {loading ? <><Spinner />Signing in</> : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

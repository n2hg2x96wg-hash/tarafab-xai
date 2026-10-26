'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clockText, useAuthLock } from '@/components/AuthShell'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()
  // Paused after 5 wrong passwords in a row (server-side); the countdown
  // survives a reload of this tab.
  const lock = useAuthLock('admin')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lock.locked) return
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
        if (res.status === 429 && typeof data.retryAfter === 'number' && data.retryAfter > 0) {
          lock.lock(data.retryAfter)
        } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
          const left = typeof data.attemptsLeft === 'number' ? data.attemptsLeft : null
          setError(left != null && left > 0 && left <= 2
            ? `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} left before sign-in is paused for 5 minutes.`
            : 'Incorrect email or password.')
        } else {
          setError(msg)
        }
        return
      }
      if (data.role !== 'admin') {
        setError('Access denied. Admin accounts only.')
        return
      }
      // Restore the session in the browser so protected pages stay logged in
      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      }
      router.push('/admin')
    } catch {
      setError('A network error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/[0.08] rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-sm font-bold text-[#fff]">₿</div>
          <span className="font-bold text-white">Tarafab<span className="text-accent">.XAi</span></span>
          <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
        </div>

        <div className="glass rounded-2xl p-8 border border-white/[0.08]">
          <h1 className="text-xl font-bold text-white mb-1 text-center">Admin Access</h1>
          <p className="text-slate-500 text-xs text-center mb-6">Restricted to administrators only</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {lock.locked && (
              <div role="status" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm" data-lockout={lock.left}>
                Too many sign-in attempts. For your security, sign-in is paused. Try again in <strong className="tabular-nums">{clockText(lock.left)}</strong>.
              </div>
            )}
            {error && !lock.locked && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@example.com"
                className="input-field"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="input-field pr-12"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-xs"
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || lock.locked || !email || !password}
              className="w-full py-3 text-sm font-semibold text-accent-ink bg-accent rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(247,147,26,0.3)] flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In to Admin'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

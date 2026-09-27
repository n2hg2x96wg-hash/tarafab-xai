'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        if (authError.message.includes('Invalid login')) setError('Incorrect email or password.')
        else if (authError.message.includes('Email not confirmed')) setError('Please verify your email before signing in.')
        else setError(authError.message)
        return
      }
      if (data.session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.session.user.id).single() as { data: { role?: string } | null }
        if (profile?.role === 'admin') router.push('/admin')
        else router.push('/dashboard')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setError(msg || 'A network error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col">
      {/* Background */}
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/[0.07] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 py-6 px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-sm font-bold">₿</div>
          <span className="font-bold text-white">Tarafab<span className="text-violet-400">.XAi</span></span>
        </Link>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-slate-400 text-sm">Sign in to your Tarafab.XAi account</p>
          </div>

          <div className="glass rounded-2xl p-8 border border-white/[0.08]">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input-field"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm"
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex justify-end mt-2">
                  <Link href="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.45)] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm">
                Don&apos;t have an account?{' '}
                <Link href="/sign-up" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

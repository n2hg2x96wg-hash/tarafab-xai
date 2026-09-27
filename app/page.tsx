'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (profile?.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      }
      setLoading(false)
    }
    checkAuth()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-white/10 py-4">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tarafab.XAi</h1>
          <div className="flex gap-4">
            <Link href="/sign-in" className="px-4 py-2 border border-white/20 rounded-lg">
              Sign In
            </Link>
            <Link href="/sign-up" className="px-4 py-2 bg-emerald-500 rounded-lg">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6">Invest with Clarity</h2>
        <p className="text-xl text-gray-400 mb-10">
          Real-time settlement, transparent reporting, institutional-grade custody.
        </p>
        <Link href="/sign-up" className="inline-block px-8 py-4 bg-emerald-500 rounded-lg text-lg font-medium">
          Open Account
        </Link>

        <div className="grid md:grid-cols-3 gap-8 mt-24 text-left">
          <div className="border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold mb-3">Segregated Cold Custody</h3>
            <p className="text-gray-400">Your assets stored securely, separate from our operations.</p>
          </div>
          <div className="border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold mb-3">Real-time Settlement</h3>
            <p className="text-gray-400">Transactions complete with full transparency.</p>
          </div>
          <div className="border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold mb-3">Transparent Reporting</h3>
            <p className="text-gray-400">Every transaction audited and logged.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-gray-500 text-sm">
        <p>&copy; 2026 Tarafab.XAi. All rights reserved.</p>
        <Link href="/staff-login" className="text-gray-800 hover:text-gray-600">.</Link>
      </footer>
    </div>
  )
}

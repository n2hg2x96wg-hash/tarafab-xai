'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LandingPage() {
  const [btcPrice, setBtcPrice] = useState<number>(67500)
  const [priceHistory, setPriceHistory] = useState<number[]>([67500])
  const [priceChange, setPriceChange] = useState<number>(0)
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

  useEffect(() => {
    if (loading) return

    const interval = setInterval(() => {
      setBtcPrice((prev) => {
        const change = (Math.random() - 0.5) * 0.006 * prev
        const newPrice = Math.max(prev + change, 30000)
        
        setPriceHistory((history) => {
          const updated = [...history, newPrice].slice(-60)
          return updated
        })

        const percentChange = ((newPrice - 67500) / 67500) * 100
        setPriceChange(percentChange)

        return newPrice
      })
    }, 2200)

    return () => clearInterval(interval)
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gray-950/50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-serif font-bold text-white">Tarafab.XAi</h1>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm text-gray-500">BTC/USD</p>
                <p className="text-xl font-mono font-bold text-white">
                  ${btcPrice.toFixed(2)}
                </p>
                <p className={`text-sm font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </p>
              </div>

              <svg width="120" height="40" className="opacity-75">
                <polyline
                  points={priceHistory
                    .map((price, i) => {
                      const minPrice = Math.min(...priceHistory)
                      const maxPrice = Math.max(...priceHistory)
                      const range = maxPrice - minPrice || 1
                      const x = (i / (priceHistory.length - 1)) * 120
                      const y = 40 - ((price - minPrice) / range) * 40
                      return `${x},${y}`
                    })
                    .join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-emerald-500"
                />
              </svg>
            </div>

            <div className="flex gap-3">
              <Link href="/sign-in" className="btn-ghost text-sm">
                Sign In
              </Link>
              <Link href="/sign-up" className="btn-primary text-sm">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>
              />
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-serif font-bold mb-16 text-center">
            Engineered for Trust
          </h2>

          <div className="grid md:grid-cols-3 gap-8 mb-32">
            {[
              {
                num: '01',
                title: 'Segregated Cold Custody',
                desc: 'Your assets stored in institutionally-secured wallets, separate from our operations.',
              },
              {
                num: '02',
                title: 'Real-time Settlement',
                desc: 'Transactions complete on-chain with full transparency and instant confirmation.',
              },
              {
                num: '03',
                title: 'Transparent Reporting',
                desc: 'Every transaction audited and logged. Full visibility into your account at all times.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="card group animate-slideInUp"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <p className="text-4xl font-serif font-bold text-emerald-500 mb-4">
                  {feature.num}
                </p>
                <h3 className="text-xl font-serif font-bold mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-serif font-bold mb-6">
            Ready to invest smarter?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join institutional investors who trust Tarafab.XAi for secure, transparent management.
          </p>
          <Link href="/sign-up" className="btn-primary inline-block">
            Create Your Account
          </Link>
        </section>

        <div className="text-center text-xs text-gray-900 mt-20">
          <Link href="/staff-login" className="hover:text-gray-700 transition-colors">
            .
          </Link>
        </div>
      </main>

      <footer className="border-t border-white/5 bg-gray-900/30 backdrop-blur-sm py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <p>&copy; 2026 Tarafab.XAi. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PricingTable, type PricingPlan } from '@/components/premium/Pricing'
import { usePt } from '@/components/premium/Premium'

type Row = { id: string; name: string; tier: PricingPlan['tier']; billing_interval: 'month' | 'year'; billing_period: PricingPlan['period'] | null; price: string; promo_price: string | null
  promo_label: string | null; currency: string; description: string; features: string[]; highlighted: boolean }

// Landing pricing (loaded when scrolled near). Choosing a plan leads to
// sign-up; payment happens only from a signed-in account.
export default function LandingPricing() {
  const pt = usePt()
  const router = useRouter()
  const [data, setData] = useState<{ plans: Row[]; free: { automations: number; watchlist: number } | null } | null>(null)
  useEffect(() => { fetch('/api/plans').then(r => r.json()).then(setData).catch(() => setData({ plans: [], free: null })) }, [])
  if (!data || !data.plans.length) return null
  return (
    <section id="pricing" className="scroll-mt-16 border-b border-ink-700" aria-labelledby="pricing-title">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 id="pricing-title" className="text-center text-2xl sm:text-3xl font-semibold tracking-tight text-fg">{pt('pp.title')}</h2>
        <p className="mt-2 mb-8 text-center text-[15px] text-fg-muted">{pt('pp.subtitle')}</p>
        <PricingTable
          plans={data.plans.map(p => ({ id: p.id, name: p.name, tier: p.tier, period: p.billing_period || p.billing_interval, price: Number(p.price), promo_price: p.promo_price == null ? null : Number(p.promo_price),
            promo_label: p.promo_label, currency: p.currency, description: p.description, features: p.features || [], highlighted: p.highlighted, available: true }))}
          freeLimits={data.free} onChoose={p => router.push(`/sign-up?plan=${encodeURIComponent(p.id)}`)} />
      </div>
    </section>
  )
}

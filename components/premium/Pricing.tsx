'use client'

import { useMemo, useState } from 'react'
import { IconCheck } from '@/components/Icons'
import { usePt } from '@/components/premium/Premium'

// Plans come from the admin-managed premium_plans table; nothing here is a
// hardcoded price. Free is the existing free experience (limits from the
// admin's Premium settings).
export type PricingPlan = {
  id: string; name: string; tier: 'standard' | 'premium' | 'pro'; period: 'month' | 'quarter' | 'year'; price: number; promo_price: number | null; promo_label: string | null
  currency: string; description: string; features: string[]; highlighted: boolean; available: boolean; note?: string
}
type Period = PricingPlan['period']
const TIERS: PricingPlan['tier'][] = ['standard', 'premium', 'pro']

export function money(n: number, currency: string) {
  try { return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `${currency} ${n}` }
}

export function PricingTable({ plans, freeLimits, currentPlanId, isFree, onChoose, busyId }: {
  plans: PricingPlan[]; freeLimits: { automations: number; watchlist: number } | null; currentPlanId?: string | null; isFree?: boolean
  onChoose: (p: PricingPlan) => void; busyId?: string
}) {
  const pt = usePt()
  const periods = useMemo(() => (['month', 'quarter', 'year'] as Period[]).filter(p => plans.some(x => x.period === p)), [plans])
  const [period, setPeriod] = useState<Period>(() => (periods.includes('month') ? 'month' : periods[0] || 'month'))
  const active = periods.includes(period) ? period : periods[0] || 'month'
  return (
    <div className="pricing">
      {periods.length > 1 && (
        <div className="flex justify-center mb-6">
          <div className="seg" role="tablist" aria-label={pt('pp.title')}>
            {periods.map(p => <button key={p} role="tab" aria-selected={active === p} onClick={() => setPeriod(p)} className={`seg-btn ${active === p ? 'seg-btn-on' : ''}`}>{pt(`pp.${p}`)}</button>)}
          </div>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
        <li className="price-card panel p-5 flex flex-col">
          <p className="text-[12px] uppercase tracking-[0.14em] text-fg-faint">{pt('pp.free')}</p>
          <p className="mt-2 text-3xl font-semibold text-fg">{pt('pp.freePrice')}</p>
          <p className="mt-2 text-[13px] text-fg-muted">{pt('pp.freeDesc')}</p>
          <ul className="mt-4 space-y-2 text-[13px] text-fg-muted flex-1">
            {[pt('pp.f.core'), ...(freeLimits ? [pt('pp.f.automations', { n: freeLimits.automations }), pt('pp.f.watchlist', { n: freeLimits.watchlist })] : [])].map(f => (
              <li key={f} className="flex gap-2"><IconCheck width={14} height={14} className="mt-0.5 shrink-0 text-emerald-400" />{f}</li>
            ))}
          </ul>
          {isFree !== undefined && <p className="mt-4 text-center text-[13px] text-fg-faint">{isFree ? pt('pp.current') : ' '}</p>}
        </li>
        {TIERS.map(tier => {
          const p = plans.find(x => x.tier === tier && x.period === active)
          if (!p && !plans.some(x => x.tier === tier)) return null
          const current = !!p && p.id === currentPlanId
          return (
            <li key={tier} className={`price-card panel p-5 flex flex-col relative ${p?.highlighted ? 'price-card-hi' : ''}`}>
              {p?.highlighted && <span className="absolute -top-2.5 left-5 rounded-full bg-amber-400 text-ink-950 text-[11px] font-semibold px-2.5 py-0.5">{pt('pp.recommended')}</span>}
              <p className="text-[12px] uppercase tracking-[0.14em] text-fg-faint">{pt(`pp.tier.${tier}`)}</p>
              {p ? (
                <>
                  <p className="mt-1 text-[15px] font-semibold text-fg">{p.name}</p>
                  <p className="mt-2 text-3xl font-semibold text-fg tabular-nums">{money(p.promo_price ?? p.price, p.currency)}<span className="text-sm font-normal text-fg-faint"> {pt(`pp.per.${p.period}`)}</span></p>
                  {p.promo_price != null && <p className="text-[12px] text-fg-faint"><s>{money(p.price, p.currency)}</s> {p.promo_label}</p>}
                  {p.description && <p className="mt-2 text-[13px] text-fg-muted">{p.description}</p>}
                  <ul className="mt-4 space-y-2 text-[13px] text-fg-muted flex-1">
                    {p.features.map(f => <li key={f} className="flex gap-2"><IconCheck width={14} height={14} className="mt-0.5 shrink-0 text-emerald-400" />{f}</li>)}
                  </ul>
                  {p.note && <p className="mt-3 text-[11px] text-fg-faint">{p.note}</p>}
                  <button onClick={() => onChoose(p)} disabled={!p.available || current || busyId === p.id}
                    className={`btn w-full mt-4 min-h-[44px] ${p.highlighted ? 'btn-solid' : 'btn-outline'}`}>
                    {current ? pt('pp.current') : !p.available ? pt('pp.unavailable') : pt('pp.choose', { plan: p.name })}
                  </button>
                </>
              ) : <p className="mt-3 text-[13px] text-fg-faint flex-1">{pt('pp.notOffered')}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

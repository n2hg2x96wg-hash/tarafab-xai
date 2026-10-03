'use client'

import { useEffect, useMemo, useState } from 'react'
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

// Live USD/NGN display rate from /api/fx (shared across components).
// undefined = loading, null = no reliable rate (then no USD line is shown).
// The last good rate is kept in the browser (max 7 days) so the page can show
// it at once and fall back to it if the rate service is briefly unavailable.
let fxPromise: Promise<number | null> | null = null
const FX_KEY = 'tarafab.fx.usdngn', FX_MAX_AGE = 7 * 24 * 3600_000
function cachedRate(): number | null {
  try { const c = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); return c && Date.now() - c.at < FX_MAX_AGE && c.rate > 0 ? Number(c.rate) : null } catch { return null }
}
export function useUsdNgn(): number | null | undefined {
  const [rate, setRate] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    const cached = cachedRate()
    if (cached) setRate(cached)
    fxPromise ||= fetch('/api/fx').then(r => (r.ok ? r.json() : null)).then(j => (j && Number.isFinite(j.rate) && j.rate > 0 ? Number(j.rate) : null)).catch(() => null)
    let live = true
    fxPromise.then(v => {
      if (v) { try { localStorage.setItem(FX_KEY, JSON.stringify({ rate: v, at: Date.now() })) } catch { /* ignore */ } }
      if (live) setRate(v ?? cached ?? null)
    })
    return () => { live = false }
  }, [])
  return rate
}

// USD headline with the exact NGN price underneath (NGN plans); NGN only
// when no reliable rate exists; a fixed-size placeholder while loading.
export function PriceStack({ amount, currency, period, rate, size = 'card' }: { amount: number; currency: string; period: string; rate: number | null | undefined; size?: 'card' | 'modal' }) {
  const pt = usePt()
  const per = pt(`pp.per.${period}`)
  const big = size === 'card' ? 'text-3xl' : 'text-xl'
  if (currency !== 'NGN') return <p className={`mt-2 ${big} font-semibold text-fg tabular-nums whitespace-nowrap`}>{money(amount, currency)}<span className="text-sm font-normal text-fg-faint"> {per}</span></p>
  const usd = usdEquivalent(amount, currency, rate)
  return (
    <div className={size === 'card' ? 'mt-2' : ''} data-price-stack>
      {usd ? (
        <p className={`${big} font-semibold text-fg tabular-nums whitespace-nowrap`} title={pt('pp.usdApprox')}>{usd}<span className="text-sm font-normal text-fg-faint"> {per}</span></p>
      ) : rate === undefined ? (
        <p className={`${big} font-semibold tabular-nums`} aria-hidden="true"><span className="inline-block h-[1em] w-28 rounded-md bg-white/[0.06] animate-pulse align-middle" /></p>
      ) : (
        <p className={`${big} font-semibold text-fg tabular-nums whitespace-nowrap`}>{money(amount, currency)}<span className="text-sm font-normal text-fg-faint"> {per}</span></p>
      )}
      {(usd || rate === undefined) && <p className="mt-0.5 text-[13px] text-fg-muted tabular-nums whitespace-nowrap" data-ngn-secondary>≈ {money(amount, currency)} {per}</p>}
    </div>
  )
}
export function usdEquivalent(amount: number, currency: string, rate: number | null | undefined) {
  if (currency !== 'NGN' || !rate) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / rate)
}
// "Premium Monthly NGN" → "Premium Monthly" for clients.
export const displayName = (name: string) => name.replace(/\s+(NGN|USD)$/i, '')

export function PricingTable({ plans, freeLimits, currentPlanId, isFree, onChoose, busyId }: {
  plans: PricingPlan[]; freeLimits: { automations: number; watchlist: number } | null; currentPlanId?: string | null; isFree?: boolean
  onChoose: (p: PricingPlan) => void; busyId?: string
}) {
  const pt = usePt()
  const rate = useUsdNgn()
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
                  <p className="mt-1 text-[15px] font-semibold text-fg">{displayName(p.name)}</p>
                  <PriceStack amount={p.promo_price ?? p.price} currency={p.currency} period={p.period} rate={rate} />
                  {p.promo_price != null && <p className="text-[12px] text-fg-faint"><s>{money(p.price, p.currency)}</s> {p.promo_label}</p>}
                  {p.description && <p className="mt-2 text-[13px] text-fg-muted">{p.description}</p>}
                  <ul className="mt-4 space-y-2 text-[13px] text-fg-muted flex-1">
                    {p.features.map(f => <li key={f} className="flex gap-2"><IconCheck width={14} height={14} className="mt-0.5 shrink-0 text-emerald-400" />{f}</li>)}
                  </ul>
                  {p.note && <p className="mt-3 text-[11px] text-fg-faint">{p.note}</p>}
                  <button onClick={() => onChoose(p)} disabled={!p.available || current || busyId === p.id}
                    className={`btn w-full mt-4 min-h-[44px] ${p.highlighted ? 'btn-solid' : 'btn-outline'}`}>
                    {current ? pt('pp.current') : !p.available ? pt('pp.unavailable') : pt('pp.choose', { plan: displayName(p.name) })}
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

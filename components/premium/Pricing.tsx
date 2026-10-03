'use client'

import { useEffect, useMemo, useState } from 'react'
import { CURRENCIES, DEFAULT_CURRENCY_CONFIG, isCurrency, parseCurrencyConfig, type CurrencyConfig } from '@/lib/currency'
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

// Display currency + exchange rates (display only; NGN is always what is
// billed). Currency: the visitor's own choice, else their IP country (if
// auto-detect is on and that currency is enabled), else the admin fallback.
// Rates: /api/fx (USD-based), cached in the browser for instant display and
// as a fallback for up to 7 days.
type Fx = Record<string, number>
type Geo = { country: string | null; currency: string; config: CurrencyConfig }
let fxPromise: Promise<Fx | null> | null = null
let geoPromise: Promise<Geo | null> | null = null
const FX_KEY = 'tarafab.fx.rates', FX_MAX_AGE = 7 * 24 * 3600_000, CUR_KEY = 'tarafab.displayCurrency'
const curSubs = new Set<(c: string) => void>()
function cachedFx(): Fx | null {
  try { const c = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); return c && Date.now() - c.at < FX_MAX_AGE && c.rates?.NGN > 0 ? c.rates : null } catch { return null }
}
export type DisplayPricing = { currency: string; rates: Fx | null | undefined; country: string | null; enabled: string[]; setCurrency: (c: string) => void }
export function useDisplayPricing(): DisplayPricing {
  const [rates, setRates] = useState<Fx | null | undefined>(undefined)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => {
    const cached = cachedFx()
    if (cached) setRates(cached)
    try { const c = localStorage.getItem(CUR_KEY); if (isCurrency(c)) setChosen(c) } catch { /* ignore */ }
    fxPromise ||= fetch('/api/fx').then(r => (r.ok ? r.json() : null)).then(j => (j && j.rates && j.rates.NGN > 0 ? j.rates as Fx : null)).catch(() => null)
    geoPromise ||= fetch('/api/geo').then(r => (r.ok ? r.json() : null)).then(j => (j ? { country: j.country ?? null, currency: String(j.currency || ''), config: parseCurrencyConfig(j.config) } : null)).catch(() => null)
    let live = true
    fxPromise.then(v => {
      if (v) { try { localStorage.setItem(FX_KEY, JSON.stringify({ rates: v, at: Date.now() })) } catch { /* ignore */ } }
      if (live) setRates(v ?? cached ?? null)
    })
    geoPromise.then(g => { if (live) setGeo(g) })
    const sub = (c: string) => setChosen(c)
    curSubs.add(sub)
    return () => { live = false; curSubs.delete(sub) }
  }, [])
  const cfg = geo?.config || DEFAULT_CURRENCY_CONFIG
  const currency = chosen && cfg.enabled.includes(chosen) ? chosen : geo?.currency && cfg.enabled.includes(geo.currency) ? geo.currency : cfg.fallback
  const setCurrency = (c: string) => { try { localStorage.setItem(CUR_KEY, c) } catch { /* ignore */ } curSubs.forEach(f => f(c)) }
  return { currency, rates, country: geo?.country ?? null, enabled: cfg.enabled, setCurrency }
}
// NGN amount converted to `to` (null when no reliable rate).
export function convertNgn(amount: number, to: string, rates: Fx | null | undefined) {
  if (to === 'NGN') return amount
  if (!rates?.NGN || !rates[to]) return null
  return amount / rates.NGN * rates[to]
}
export function fmtMoney(n: number, c: string) {
  try {
    return new Intl.NumberFormat(c === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: c === 'NGN' && n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(n)
  } catch { return `${c} ${n.toFixed(2)}` }
}
// Kept for callers of the previous API: NGN per USD.
export function useUsdNgn(): number | null | undefined { const { rates } = useDisplayPricing(); return rates === undefined ? undefined : rates?.NGN ?? null }
export function usdEquivalent(amount: number, currency: string, rate: number | null | undefined) {
  if (currency !== 'NGN' || !rate) return null
  return fmtMoney(amount / rate, 'USD')
}

// Local-currency headline with the original NGN price underneath. Nigeria
// (NGN display) shows ₦ as the headline with the USD equivalent underneath.
// No reliable rate: the NGN price is the headline. Fixed placeholder while
// the rate loads so prices do not shift.
// One client-facing price, in the visitor's display currency (converted from
// the plan's NGN price; NGN itself for Nigeria). No second currency line.
// No reliable rate: the plan's real NGN price is shown (never an invented
// conversion). A same-height placeholder while the rate loads, so cards do
// not shift.
export function PriceStack({ amount, currency, period, pricing, size = 'card' }: { amount: number; currency: string; period: string; pricing: DisplayPricing; size?: 'card' | 'modal' }) {
  const pt = usePt()
  const per = pt(`pp.per.${period}`)
  const big = size === 'card' ? 'text-3xl' : 'text-xl'
  const headline = (text: string, title?: string) => <p className={`${big} font-semibold text-fg tabular-nums whitespace-nowrap`} title={title}>{text}<span className="text-sm font-normal text-fg-faint"> {per}</span></p>
  const wrap = (body: React.ReactNode, disp: string) => <div className={size === 'card' ? 'mt-2' : ''} data-price-stack data-display-currency={disp}>{body}</div>
  if (currency !== 'NGN') return wrap(headline(money(amount, currency)), currency)
  const { currency: disp, rates } = pricing
  if (disp === 'NGN') return wrap(headline(fmtMoney(amount, 'NGN')), 'NGN')
  const local = convertNgn(amount, disp, rates)
  if (local != null) return wrap(headline(fmtMoney(local, disp), pt('pp.localApprox')), disp)
  if (rates === undefined) return wrap(<p className={`${big} font-semibold tabular-nums`} aria-hidden="true"><span className="inline-block h-[1em] w-28 rounded-md bg-white/[0.06] animate-pulse align-middle" /></p>, disp)
  return wrap(headline(fmtMoney(amount, 'NGN')), 'NGN')
}

// "Prices shown in" selector (display only; never affects checkout).
export function CurrencySelector({ pricing }: { pricing: DisplayPricing }) {
  const pt = usePt()
  return (
    <label className="inline-flex items-center gap-2 text-[12px] text-fg-muted">
      {pt('pp.showIn')}
      <select value={pricing.currency} onChange={e => pricing.setCurrency(e.target.value)} className="field !py-1 !px-2 !w-auto text-[12px]" aria-label={pt('pp.showIn')} data-currency-select>
        {pricing.enabled.map(c => <option key={c} value={c}>{c} · {CURRENCIES[c] || c}</option>)}
      </select>
    </label>
  )
}

// The price already shows the client's currency, so a plan description
// sentence that announces a billing currency ("billed monthly in Nigerian
// Naira") is dropped from the client card. The stored text is unchanged
// (editable in Admin → Premium); other sentences are kept.
const CURRENCY_WORDS = /\b(naira|ngn|dollars?|usd|pounds?|sterling|gbp|euros?|eur|cedis?|ghs|shillings?|kes|rand|zar|pesos?|php|rupees?|inr|dirhams?|aed)\b|[₦$£€]/i
export function clientDescription(desc: string) {
  const parts = (desc || '').trim().split(/(?<=[.!?])\s+/).filter(Boolean)
  return parts.filter(p => !(/\b(billed|charged|paid|priced|payable)\b/i.test(p) && CURRENCY_WORDS.test(p))).join(' ').trim()
}

// "Premium Monthly NGN" → "Premium Monthly" for clients.
export const displayName = (name: string) => name.replace(/\s+(NGN|USD)$/i, '')

export function PricingTable({ plans, freeLimits, currentPlanId, isFree, onChoose, busyId }: {
  plans: PricingPlan[]; freeLimits: { automations: number; watchlist: number } | null; currentPlanId?: string | null; isFree?: boolean
  onChoose: (p: PricingPlan) => void; busyId?: string
}) {
  const pt = usePt()
  const pricing = useDisplayPricing()
  const periods = useMemo(() => (['month', 'quarter', 'year'] as Period[]).filter(p => plans.some(x => x.period === p)), [plans])
  const [period, setPeriod] = useState<Period>(() => (periods.includes('month') ? 'month' : periods[0] || 'month'))
  const active = periods.includes(period) ? period : periods[0] || 'month'
  return (
    <div className="pricing">
      {plans.some(p => p.currency === 'NGN') && <div className="flex justify-end mb-3"><CurrencySelector pricing={pricing} /></div>}
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
                  <PriceStack amount={p.promo_price ?? p.price} currency={p.currency} period={p.period} pricing={pricing} />
                  {p.promo_price != null && <p className="text-[12px] text-fg-faint"><s>{money(p.price, p.currency)}</s> {p.promo_label}</p>}
                  {clientDescription(p.description) && <p className="mt-2 text-[13px] text-fg-muted">{clientDescription(p.description)}</p>}
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

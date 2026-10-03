'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { premiumText } from '@/lib/i18n/premium'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconCheck, IconLock } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'
import { fmt, type Account, type Tx } from '@/components/dashboard/shared'
import { TIMEFRAMES } from '@/lib/assets'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { createClient } from '@/lib/supabase/client'
import { PricingTable, money as planMoney, useDisplayPricing, displayName, PriceStack } from '@/components/premium/Pricing'
import { newRequestKey } from '@/lib/authFetch'

export type PremiumInfo = {
  status: 'free' | 'premium' | 'expired' | 'cancelled' | 'past_due' | 'trial'
  premium: boolean
  subscription: null | { plan_id: string | null; status: string; source: 'payment' | 'admin_override'; current_period_end: string | null; cancel_at_period_end: boolean }
  limits: { automations: number; watchlist: number; free_automations: number; premium_automations: number; free_watchlist: number; premium_watchlist: number }
  usage: { automations: number; watchlist: number }
  premium_timeframes: string[]
  plans: { id: string; name: string; interval: 'month' | 'year'; period?: 'month' | 'quarter' | 'year'; tier?: 'standard' | 'premium' | 'pro'; description?: string; features?: string[]; highlighted?: boolean
    price: number; currency: string; promo_price: number | null; promo_label: string | null; checkout: boolean; seerbit?: boolean; seerbit_country?: string | null }[]
  payments_recent?: { reference: string; plan_id: string; amount: number; currency: string; status: string; verification_status: string; created_at: string }[]
  payments: boolean
}

export function usePt() {
  const { locale } = useI18n()
  return useCallback((key: string, vars?: Record<string, string | number>) => premiumText(locale, key, vars), [locale])
}

// One shared copy of the caller's entitlement for every component on the
// page. The server remains the authority: limits and Premium timeframes are
// enforced in the database and API, this only decides what to show.
let shared: { data: PremiumInfo | null; error: string; at: number; p?: Promise<void> } = { data: null, error: '', at: 0 }
const listeners = new Set<() => void>()
async function fetchPremium() {
  try {
    const d = await readJson<PremiumInfo>(await authFetch('/api/client/premium'))
    // Only a complete answer is used; anything else counts as "not loaded"
    // (features then fall back to the free view, and the server still decides).
    if (!d || typeof d.premium !== 'boolean' || !Array.isArray(d.premium_timeframes) || !Array.isArray(d.plans) || !d.limits || !d.usage) throw new Error('Premium details could not be loaded.')
    shared = { data: d, error: '', at: Date.now() }
  }
  catch (e) { shared = { ...shared, error: errorText(e), at: Date.now() } }
  listeners.forEach(f => f())
}
export function refreshPremium() { shared.p = fetchPremium(); return shared.p }

export function usePremium() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    if (!shared.p || Date.now() - shared.at > 60_000) refreshPremium()
    return () => { listeners.delete(f) }
  }, [])
  return { info: shared.data, error: shared.error, loading: !shared.data && !shared.error, refresh: refreshPremium }
}

// Any feature can ask for the paywall; the dashboard hosts one modal.
export const openPremiumGate = (feature?: string) => window.dispatchEvent(new CustomEvent('tarafab:premium-gate', { detail: { feature } }))

export function PremiumBadge({ className = '' }: { className?: string }) {
  const pt = usePt()
  return <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ${className}`}><IconLock width={10} height={10} />{pt('pr.badge')}</span>
}

export function PremiumGateHost({ onSeePremium }: { onSeePremium: () => void }) {
  const pt = usePt()
  const [feature, setFeature] = useState<string | null>(null)
  useEffect(() => {
    const on = (e: Event) => setFeature((e as CustomEvent).detail?.feature || '')
    window.addEventListener('tarafab:premium-gate', on)
    return () => window.removeEventListener('tarafab:premium-gate', on)
  }, [])
  if (feature === null) return null
  return (
    <ConfirmModal title={pt('pr.gateTitle')} confirmLabel={pt('pr.seePremium')} cancelLabel={pt('pr.notNow')}
      onCancel={() => setFeature(null)} onConfirm={() => { setFeature(null); onSeePremium() }}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid place-items-center h-9 w-9 shrink-0 rounded-full bg-amber-400/10 text-amber-300 premium-glow"><IconLock width={16} height={16} /></span>
        <div>
          <p className="text-sm text-fg">{pt('pr.gateBody')}</p>
          {feature && <p className="mt-1 text-[13px] text-fg-muted">{feature}</p>}
        </div>
      </div>
    </ConfirmModal>
  )
}

const money = (n: number, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n) } catch { return `${currency} ${fmt(n)}` }
}

export function PremiumCenter({ account, txs }: { account: Account | null; txs: Tx[] }) {
  const pt = usePt()
  const { intl } = useI18n()
  const { info, error, loading, refresh } = usePremium()
  const [review, setReview] = useState<PremiumInfo['plans'][number] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const feature = useFeatures()
  const analytics = feature('portfolio_analytics')
  const [payReview, setPayReview] = useState<PremiumInfo['plans'][number] | null>(null)
  const [payBusy, setPayBusy] = useState('')
  // ?payment=restricted|unverified|unavailable set when a payment could not start.
  const [payNotice, setPayNotice] = useState<string>(() => { try { return new URLSearchParams(window.location.search).get('payment') || '' } catch { return '' } })
  const payKey = useRef(newRequestKey())
  // Payment-access gateway: the server checks the country, the plan, the
  // amount and availability; only then does it return SeerBit's page.
  const pricing = useDisplayPricing()
  const startPay = async () => {
    if (!payReview) return
    setPayBusy(payReview.id); setErr('')
    try {
      // Eligibility is decided by the database from Cloudflare's cf-ipcountry,
      // which Supabase's edge sets from this browser's own IP (a sent value is
      // overwritten). No country is sent; plan price/currency/link are looked
      // up server-side. Only the plan id goes out.
      const sb = createClient()
      const { data, error } = await (sb.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)
        .call(sb, 'gateway_start_payment', { p_key: null, p_plan: payReview.id, p_country: null, p_idempotency_key: payKey.current })
      if (error) throw new Error(error.message)
      const r = (data || { status: 'disabled' }) as { status: string; url?: string; reference?: string }
      if (r.status === 'ok' && r.url && r.reference && /^https:\/\/pay\.seerbitapi\.com\//.test(r.url)) {
        try { sessionStorage.setItem('tarafab.payRef', r.reference) } catch { /* the return page also lists recent payments */ }
        window.location.assign(r.url); return
      }
      // Server not configured yet (gateway key): not a paused plan.
      if (r.status === 'unavailable') { setErr(pt('pr.paymentsOff')); setPayBusy(''); setPayReview(null); payKey.current = newRequestKey(); return }
      // Outside Nigeria (or location not confirmed): back to the dashboard
      // with the message; the session is kept and no payment URL was sent.
      if (r.status === 'region_blocked' || r.status === 'unknown_region') {
        const reason = r.status === 'region_blocked' ? 'restricted' : 'unverified'
        setPayBusy(''); setPayReview(null); payKey.current = newRequestKey()
        window.history.replaceState(null, '', `/dashboard?payment=${reason}#premium`); setPayNotice(reason); return
      }
      window.location.assign('/payment/unavailable?reason=disabled'); return
    } catch (e) { setErr(errorText(e)) }
    setPayBusy(''); setPayReview(null); payKey.current = newRequestKey()
  }

  // Back from the payment page: re-read the entitlement a few times while
  // the provider's confirmation arrives (it is the only thing that unlocks).
  useEffect(() => {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('premium')) return
    setMsg(pt('pr.activating'))
    let n = 0
    const id = setInterval(() => { n++; refresh(); if (n >= 10) clearInterval(id) }, 6000)
    const url = new URL(window.location.href); url.searchParams.delete('premium'); window.history.replaceState(null, '', url.toString())
    return () => clearInterval(id)
  }, [pt, refresh])

  const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString(intl, { year: 'numeric', month: 'short', day: 'numeric' }) : '')

  const checkout = async () => {
    if (!review) return
    setBusy(true); setErr('')
    try {
      const r = await readJson<{ url?: string }>(await authFetch('/api/client/premium', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'checkout', plan_id: review.id }) }))
      if (r.url) { window.location.assign(r.url); return }
      setErr(pt('pr.paymentsOff'))
    } catch (e) { setErr(errorText(e)) }
    setBusy(false); setReview(null)
  }
  const change = async (action: 'cancel' | 'resume') => {
    setBusy(true); setErr('')
    try {
      await readJson(await authFetch('/api/client/premium', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }))
      setMsg(pt('pr.changeRequested')); setTimeout(refresh, 4000)
    } catch (e) { setErr(errorText(e)) }
    setBusy(false); setConfirmCancel(false)
  }

  if (loading) return <div className="panel p-8 flex items-center gap-2 text-sm text-fg-muted"><Spinner /> …</div>
  if (!info) return <div className="panel p-6 text-sm text-red-300" role="alert">{pt('pr.loadError')} {error}</div>

  const sub = info.subscription
  const freeTf = TIMEFRAMES.filter(tf => !info.premium_timeframes.includes(tf)).join(' · ')
  const rows: [string, string, string][] = [
    [pt('pr.f.automations'), String(info.limits.free_automations), String(info.limits.premium_automations)],
    [pt('pr.f.watchlist'), String(info.limits.free_watchlist), String(info.limits.premium_watchlist)],
    [pt('pr.f.timeframes'), info.premium_timeframes.length ? freeTf : pt('pr.allTf'), pt('pr.allTf')],
    [pt('pr.f.indicators'), pt('pr.notIncluded'), pt('pr.included')],
    [pt('pr.f.analytics'), pt('pr.notIncluded'), pt('pr.included')],
  ]

  return (
    <div className="space-y-6 panel-in">
      <div className="panel p-6 premium-hero overflow-hidden relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg flex items-center gap-2">{pt('pr.title')} {info.premium && <PremiumBadge />}</h2>
            <p className="mt-1 text-sm text-fg-muted max-w-xl">{pt('pr.subtitle')}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold ${info.premium ? 'text-amber-300' : 'text-fg'}`}>{pt(`pr.status.${info.status}`)}</p>
            {sub?.current_period_end && info.premium && (
              <p className="text-[12px] text-fg-faint">{sub.cancel_at_period_end || sub.source === 'admin_override' ? pt('pr.ends', { date: date(sub.current_period_end) }) : pt('pr.renews', { date: date(sub.current_period_end) })}</p>
            )}
            {sub?.source === 'admin_override' && <p className="text-[12px] text-fg-faint">{pt('pr.manual')}</p>}
          </div>
        </div>
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          {[[pt('pr.usageAuto', { used: info.usage.automations, limit: info.limits.automations }), info.usage.automations / Math.max(info.limits.automations, 1)],
            [pt('pr.usageWl', { used: info.usage.watchlist, limit: info.limits.watchlist }), info.usage.watchlist / Math.max(info.limits.watchlist, 1)]].map(([label, frac]) => (
            <div key={String(label)} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
              <p className="text-[13px] text-fg-muted">{label}</p>
              <div className="mt-2 h-1.5 rounded-full bg-ink-700 overflow-hidden"><div className="h-full rounded-full bg-accent usage-fill" style={{ width: `${Math.min(100, Number(frac) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
        {msg && <p role="status" className="mt-4 text-sm text-emerald-300">{msg}</p>}
        {err && <p role="alert" className="mt-4 text-sm text-red-300">{err}</p>}
        {sub?.source === 'payment' && info.premium && (
          <div className="mt-4">
            {sub.cancel_at_period_end
              ? <button onClick={() => change('resume')} disabled={busy} className="btn btn-sm btn-outline">{busy ? <Spinner /> : null}{pt('pr.resumeSub')}</button>
              : <button onClick={() => setConfirmCancel(true)} disabled={busy} className="btn btn-sm btn-ghost text-red-300">{pt('pr.cancelSub')}</button>}
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <h3 className="px-5 py-3 border-b border-ink-700 text-[15px] font-semibold text-fg">{pt('pr.compare')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-fg-faint">
              <th className="px-5 py-2 font-medium">{pt('pr.colFeature')}</th><th className="px-3 py-2 font-medium">{pt('pr.colFree')}</th><th className="px-3 py-2 font-medium text-amber-300">{pt('pr.colPremium')}</th>
            </tr></thead>
            <tbody>{rows.map(([f, a, b]) => (
              <tr key={f} className="border-t border-ink-700"><td className="px-5 py-2.5 text-fg">{f}</td><td className="px-3 py-2.5 text-fg-muted">{a}</td><td className="px-3 py-2.5 text-fg">{b}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <section className="panel p-5 sm:p-6" aria-labelledby="pp-title">
        <h3 id="pp-title" className="text-[15px] font-semibold text-fg">{pt('pp.title')}</h3>
        <p className="text-[13px] text-fg-faint mt-0.5 mb-5">{pt('pp.subtitle')}</p>
        {['restricted', 'unverified', 'unavailable'].includes(payNotice) && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200 flex items-start justify-between gap-3">
            <span>{pt(payNotice === 'restricted' ? 'pay.restrictedNg' : payNotice === 'unverified' ? 'pay.unknownBody' : 'pay.disabledBody')}</span>
            <button onClick={() => setPayNotice('')} className="text-amber-200/70 hover:text-amber-100" aria-label={pt('pr.notNow')}>×</button>
          </div>
        )}
        {!info.plans.length ? <p className="text-sm text-fg-muted">{pt('pr.noPlans')}</p> : (<>
          {!info.premium && !info.plans.some(p => p.seerbit || (info.payments && p.checkout)) && <p className="mb-4 text-sm text-amber-300" role="status">{pt('pr.paymentsOff')}</p>}
          <PricingTable
            plans={info.plans.map(p => ({ id: p.id, name: p.name, tier: p.tier || 'premium', period: p.period || p.interval, price: Number(p.price), promo_price: p.promo_price == null ? null : Number(p.promo_price),
              promo_label: p.promo_label, currency: p.currency, description: p.description || '', features: p.features || [], highlighted: !!p.highlighted,
              available: !!p.seerbit || (info.payments && p.checkout),
              note: p.seerbit && p.seerbit_country ? pt('pp.ngOnly', { country: p.seerbit_country === 'NG' ? 'Nigeria' : p.seerbit_country }) : undefined }))}
            freeLimits={{ automations: info.limits.free_automations, watchlist: info.limits.free_watchlist }}
            currentPlanId={info.premium ? sub?.plan_id : null} isFree={!info.premium} busyId={payBusy}
            onChoose={pp => { setErr(''); const full = info.plans.find(x => x.id === pp.id)!; if (full.seerbit) setPayReview(full); else setReview(full) }} />
        </>)}
        {(info.payments_recent || []).length > 0 && (
          <ul className="mt-5 text-[12px] text-fg-faint space-y-1">
            {info.payments_recent!.map(x => <li key={x.reference} className="flex flex-wrap gap-x-2"><span className="font-mono">{x.reference}</span><span>{planMoney(Number(x.amount), x.currency)}</span><span className="text-fg-muted">{pt(`pay.st.${x.status}`)}</span></li>)}
          </ul>
        )}
      </section>

      {hiddenState(analytics) || analytics === 'coming_soon' ? null : info.premium || analytics === 'enabled' ? <PortfolioAnalytics account={account} txs={txs} /> : (
        <button onClick={() => openPremiumGate(pt('pr.f.analytics'))} className="panel p-5 w-full text-left flex items-center justify-between gap-3 hover:border-ink-500 transition-colors">
          <span className="text-[15px] font-semibold text-fg">{pt('an.title')}</span><PremiumBadge />
        </button>
      )}

      {review && (
        <ConfirmModal title={pt('pr.reviewTitle')} confirmLabel={pt('pr.continuePay')} cancelLabel={pt('tr.cancel')} busy={busy} onCancel={() => setReview(null)} onConfirm={checkout}>
          <dl className="divide-y divide-ink-700 text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pr.reviewPlan')}</dt><dd className="text-fg">{review.name}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pr.reviewPrice')}</dt><dd className="text-fg tabular-nums">{money(review.promo_price ?? review.price, review.currency)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pr.reviewBilling')}</dt><dd className="text-fg">{pt(`pr.billing.${review.interval}`)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pr.reviewTotal')}</dt><dd className="text-fg font-semibold tabular-nums">{money(review.promo_price ?? review.price, review.currency)}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] text-fg-faint">{pt('pr.reviewIncludes')}: {rows.map(r => r[0]).join(' · ')}</p>
          <p className="mt-2 text-[12px] text-fg-muted">{pt('pr.renewal')}</p>
          <p className="mt-2 text-[12px] text-fg-muted">{pt('pr.payNote')}</p>
        </ConfirmModal>
      )}
      {payReview && (
        <ConfirmModal title={pt('pay.reviewTitle')} confirmLabel={payBusy ? pt('pay.checking') : pt('pay.continue')} cancelLabel={pt('tr.cancel')} busy={!!payBusy}
          onCancel={() => { setPayReview(null); payKey.current = newRequestKey() }} onConfirm={startPay}>
          <dl className="divide-y divide-ink-700 text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pay.plan')}</dt><dd className="text-fg">{displayName(payReview.name)}</dd></div>
            <div className="flex justify-between items-start gap-4 py-2"><dt className="text-fg-muted">{pt('pay.amount')}</dt><dd className="text-right">
              {payReview.currency === 'NGN'
                ? <PriceStack amount={Number(payReview.promo_price ?? payReview.price)} currency={payReview.currency} period={payReview.period || payReview.interval} pricing={pricing} size="modal" />
                : <span className="text-fg font-semibold tabular-nums">{planMoney(Number(payReview.promo_price ?? payReview.price), payReview.currency)}</span>}
            </dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-fg-muted">{pt('pay.billing')}</dt><dd className="text-fg">{pt(`pp.${payReview.period || payReview.interval}`)}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] text-fg-muted">{pt('pay.secure')}</p>
          {payReview.currency === 'NGN' && <p className="mt-1 text-[12px] text-fg-faint">{pt('pay.ngnCheckout')}</p>}
        </ConfirmModal>
      )}
      {confirmCancel && sub && (
        <ConfirmModal title={pt('pr.cancelSub')} confirmLabel={pt('pr.cancelSub')} cancelLabel={pt('pr.resumeSub')} busy={busy} onCancel={() => setConfirmCancel(false)} onConfirm={() => change('cancel')}>
          <p className="text-sm text-fg-muted">{pt('pr.cancelConfirm', { date: date(sub.current_period_end) })}</p>
        </ConfirmModal>
      )}
    </div>
  )
}

// Premium portfolio analytics, from recorded balances and completed
// transactions only. Nothing is projected or estimated.
function PortfolioAnalytics({ account, txs }: { account: Account | null; txs: Tx[] }) {
  const pt = usePt()
  const { t, intl } = useI18n()
  const parts: [string, number, string][] = [
    [t('dash.accountBalance'), Number(account?.available_balance ?? 0), 'bg-accent'],
    [t('dash.invested'), Number(account?.invested_balance ?? 0), 'bg-sky-400'],
    [t('withdraw.profitBalance'), Number(account?.profit_balance ?? 0), 'bg-emerald-400'],
    [t('dash.pending'), Number(account?.pending_balance ?? 0), 'bg-amber-400'],
  ]
  const total = parts.reduce((s, p) => s + Math.max(p[1], 0), 0)
  const months = useMemo(() => {
    const m = new Map<string, { dep: number; wd: number; fee: number }>()
    for (const x of txs) {
      if (x.status !== 'completed' && x.status !== 'approved') continue
      const k = String((x as Tx & { effective_at?: string | null }).effective_at || x.created_at).slice(0, 7)
      const r = m.get(k) || { dep: 0, wd: 0, fee: 0 }
      if (x.type === 'deposit') r.dep += Number(x.amount)
      else if (x.type === 'withdrawal') r.wd += Number(x.amount)
      else if (x.type === 'fee') r.fee += Number(x.amount)
      else continue
      m.set(k, r)
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  }, [txs])
  const max = Math.max(1, ...months.map(([, r]) => Math.max(r.dep, r.wd)))
  return (
    <div className="panel p-5 space-y-5">
      <div className="flex items-center justify-between"><h3 className="text-[15px] font-semibold text-fg">{pt('an.title')}</h3><PremiumBadge /></div>
      <div>
        <p className="text-[13px] text-fg-muted">{pt('an.allocation')}</p>
        <div className="mt-2 flex h-3 rounded-full overflow-hidden bg-ink-700">
          {total > 0 && parts.map(([l, v, c]) => v > 0 && <div key={l} className={`${c} alloc-seg`} style={{ width: `${(v / total) * 100}%` }} title={`${l}: $${fmt(v)}`} />)}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
          {parts.map(([l, v, c]) => <li key={l} className="flex items-center gap-1.5 text-fg-muted"><span className={`h-2 w-2 rounded-full ${c}`} />{l}: <span className="text-fg tabular-nums">${fmt(v)}</span></li>)}
        </ul>
      </div>
      <div>
        <p className="text-[13px] text-fg-muted">{pt('an.flows')}</p>
        {!months.length ? <p className="mt-2 text-sm text-fg-faint">{pt('an.empty')}</p> : (
          <ul className="mt-2 space-y-2">
            {months.map(([k, r]) => (
              <li key={k} className="text-[12px]">
                <div className="flex justify-between text-fg-muted"><span>{new Date(k + '-01T00:00:00').toLocaleDateString(intl, { month: 'short', year: 'numeric' })}</span>
                  <span className="tabular-nums">{pt('an.deposits')} ${fmt(r.dep)} · {pt('an.withdrawals')} ${fmt(r.wd)} · {pt('an.fees')} ${fmt(r.fee)}</span></div>
                <div className="mt-1 grid gap-0.5">
                  <div className="h-1.5 rounded-full bg-emerald-400/70 usage-fill" style={{ width: `${(r.dep / max) * 100}%` }} />
                  <div className="h-1.5 rounded-full bg-sky-400/70 usage-fill" style={{ width: `${(r.wd / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-fg-faint flex items-center gap-1"><IconCheck width={12} height={12} />{pt('an.note')}</p>
    </div>
  )
}

// Tarafab Service Fee for an amount, worked out by the server with the active
// admin-configured rule (the same calculation used when the fee is charged).
export type FeeQuote = { state: 'idle' | 'loading' | 'ok' | 'error'; fee?: number; net?: number }
export function useServiceFee(service: 'withdrawal' | 'wallet_transfer', amount: number, extra?: { asset?: string; chainId?: number }) {
  const [q, setQ] = useState<FeeQuote>({ state: 'idle' })
  const asset = extra?.asset, chainId = extra?.chainId
  useEffect(() => {
    if (!(amount > 0)) { setQ({ state: 'idle' }); return }
    let alive = true
    setQ(s => ({ ...s, state: 'loading' }))
    const id = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ service, amount: String(amount) })
        if (asset) p.set('asset', asset)
        if (chainId) p.set('chain_id', String(chainId))
        const r = await readJson<{ quote: { fee: number; net: number } }>(await authFetch(`/api/client/fees?${p}`))
        if (alive) setQ({ state: 'ok', fee: Number(r.quote.fee), net: Number(r.quote.net) })
      } catch { if (alive) setQ({ state: 'error' }) }
    }, 350)
    return () => { alive = false; clearTimeout(id) }
  }, [service, amount, asset, chainId])
  return q
}

export function FeeRows({ q, amount, kind }: { q: FeeQuote; amount: number; kind: 'withdrawal' }) {
  const pt = usePt()
  if (!(amount > 0)) return null
  if (q.state === 'error') return <p className="text-xs text-fg-faint">{pt('wd.feeUnavailable')}</p>
  return (
    <div className="rounded-lg border border-ink-700 px-3 py-2 text-[13px] space-y-1" aria-live="polite">
      <div className="flex justify-between gap-3"><span className="text-fg-muted">{pt('wd.serviceFee')}</span>
        <span className="text-fg tabular-nums">{q.state !== 'ok' ? '…' : q.fee ? `$${fmt(q.fee)}` : pt('wd.feeNone')}</span></div>
      <div className="flex justify-between gap-3"><span className="text-fg-muted">{pt('wd.receive')}</span>
        <span className="text-fg font-medium tabular-nums">{q.state !== 'ok' ? '…' : `$${fmt(q.net ?? amount)}`}</span></div>
      {kind === 'withdrawal' && <p className="text-[11px] text-fg-faint">{pt('wd.feeNote')}</p>}
    </div>
  )
}

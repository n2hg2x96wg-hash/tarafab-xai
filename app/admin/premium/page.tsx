'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal, Field } from '@/components/AdminModal'

type Settings = { free_automation_limit: number; premium_automation_limit: number; free_watchlist_limit: number; premium_watchlist_limit: number; premium_timeframes: string[]; updated_at: string }
type Plan = { id: string; name: string; billing_interval: 'month' | 'year'; price: number; currency: string; promo_price: number | null; promo_label: string | null; provider_price_id: string | null; enabled: boolean; sort_order: number; tier?: string; billing_period?: string | null; description?: string; features?: string[]; highlighted?: boolean }
type Sub = { user_id: string; full_name: string | null; email: string | null; plan_id: string | null; status: string; entitlement: string; source: string; provider: string | null; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean; cancelled_at: string | null; updated_at: string }
const TFS = ['1H', '4H', '1D', '1W', '1M', '1Y']
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—')
const TONE: Record<string, string> = { premium: 'text-amber-300', free: 'text-slate-400', expired: 'text-slate-500', cancelled: 'text-slate-500', past_due: 'text-red-400' }

// Tarafab Premium administration. Real subscriptions only change through
// verified payment-provider events; manual overrides are a separate,
// audited action and are labelled as such everywhere.
export default function AdminPremiumPage() {
  const supabase = createClient()
  const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>).call(supabase, fn, args)
  const [st, setSt] = useState<Settings | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [sf, setSf] = useState<null | { fa: string; pa: string; fw: string; pw: string; tfs: string[]; reason: string }>(null)
  const [pf, setPf] = useState<null | { isNew: boolean; id: string; name: string; interval: string; price: string; currency: string; promo: string; promoLabel: string; priceId: string; enabled: boolean; sort: string; reason: string; tier: string; period: string; description: string; features: string; highlighted: boolean }>(null)
  const [of, setOf] = useState<null | { userId: string; email: string; plan: string; status: string; end: string; reason: string }>(null)

  const load = useCallback(async () => {
    const [s, p, l] = await Promise.all([
      (supabase.from('premium_settings') as any).select('*').eq('id', 1).single(),
      (supabase.from('premium_plans') as any).select('*').order('sort_order').order('price'),
      rpc('admin_list_subscriptions', { p_status: filter || null, p_limit: 300 }),
    ])
    if (s.error || p.error || l.error) { setError('Premium data could not be loaded.'); return }
    const okSettings = s.data && !Array.isArray(s.data) && Array.isArray(s.data.premium_timeframes)
    setSt(okSettings ? s.data : null); setPlans(Array.isArray(p.data) ? p.data : []); setSubs(Array.isArray(l.data) ? l.data as Sub[] : []); setError(okSettings ? '' : 'Premium data could not be loaded.')
  }, [supabase, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, reload])

  const run = async (fn: string, args: Record<string, unknown>, done: () => void) => {
    setBusy(true); setFormErr('')
    const { error } = await rpc(fn, args)
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    done(); load()
  }
  const findClient = async () => {
    if (!of) return
    const { data, error } = await rpc('admin_client_emails')
    if (error) { setFormErr('Client lookup failed.'); return }
    const hit = (data as { id: string; email: string }[]).find(x => x.email?.toLowerCase() === of.email.trim().toLowerCase())
    if (!hit) { setFormErr('No client with that email.'); return }
    setOf({ ...of, userId: hit.id }); setFormErr('')
  }
  const field = 'w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white'
  const count = (e: string) => (subs || []).filter(x => x.entitlement === e).length

  return (
    <AdminLayout title="Premium" subtitle="Plans, limits and client subscriptions">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[['Premium', count('premium')], ['Past due', count('past_due')], ['Cancelled', count('cancelled')], ['Expired', count('expired')]].map(([k, v]) => (
          <div key={k as string} className="glass rounded-xl border border-white/[0.08] p-3"><p className="text-[11px] text-slate-500">{k}</p><p className="text-xl font-semibold text-white tabular-nums">{subs ? v : '—'}</p></div>
        ))}
      </div>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5">
        <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-white">Limits & Premium features</h2>
          {st && <button onClick={() => { setFormErr(''); setSf({ fa: String(st.free_automation_limit), pa: String(st.premium_automation_limit), fw: String(st.free_watchlist_limit), pw: String(st.premium_watchlist_limit), tfs: st.premium_timeframes, reason: '' }) }} className="text-xs text-violet-300 hover:text-violet-200">Edit</button>}
        </div>
        {st ? (
          <dl className="grid sm:grid-cols-3 gap-3 text-xs">
            <div><dt className="text-slate-500">Active automations</dt><dd className="text-white">Free {st.free_automation_limit} · Premium {st.premium_automation_limit}</dd></div>
            <div><dt className="text-slate-500">Watchlist assets</dt><dd className="text-white">Free {st.free_watchlist_limit} · Premium {st.premium_watchlist_limit}</dd></div>
            <div><dt className="text-slate-500">Premium-only chart timeframes</dt><dd className="text-white">{st.premium_timeframes.length ? st.premium_timeframes.join(', ') : 'None (all free)'}</dd></div>
          </dl>
        ) : <p className="text-xs text-slate-500">Loading…</p>}
        <p className="mt-2 text-[11px] text-slate-500">Enforced by the database for every client. Existing automations above a new limit keep running; new ones are blocked until the client is under the limit.</p>
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5">
        <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-white">Plans</h2>
          <button onClick={() => { setFormErr(''); setPf({ isNew: true, id: '', name: '', interval: 'month', price: '', currency: 'USD', promo: '', promoLabel: '', priceId: '', enabled: false, sort: '0', reason: '', tier: 'premium', period: 'month', description: '', features: '', highlighted: false }) }} className="text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5">Add plan</button>
        </div>
        {!plans ? <p className="text-xs text-slate-500">Loading…</p> : !plans.length ? <p className="text-xs text-slate-400">No plans yet. Clients see “Premium plans are not available yet.”</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Plan</th><th className="pr-3">Price</th><th className="pr-3">Promotion</th><th className="pr-3">Payment provider price</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>{plans.map(p => (
              <tr key={p.id} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3">{p.name}<div className="text-slate-500">{p.id}</div></td>
                <td className="pr-3 tabular-nums">{p.currency} {Number(p.price).toFixed(2)} / {p.billing_interval}</td>
                <td className="pr-3">{p.promo_price != null ? `${p.currency} ${Number(p.promo_price).toFixed(2)} ${p.promo_label || ''}` : '—'}</td>
                <td className="pr-3 font-mono">{p.provider_price_id || <span className="text-amber-300 font-sans">Not linked — cannot be purchased</span>}</td>
                <td className="pr-3">{p.enabled ? <span className="text-emerald-400">Enabled</span> : <span className="text-slate-500">Hidden</span>}</td>
                <td><button onClick={() => { setFormErr(''); setPf({ isNew: false, id: p.id, name: p.name, interval: p.billing_interval, price: String(p.price), currency: p.currency, promo: p.promo_price == null ? '' : String(p.promo_price), promoLabel: p.promo_label || '', priceId: p.provider_price_id || '', enabled: p.enabled, sort: String(p.sort_order), reason: '', tier: p.tier || 'premium', period: p.billing_period || p.billing_interval, description: p.description || '', features: (p.features || []).join('\n'), highlighted: !!p.highlighted }) }} className="text-violet-300 hover:text-violet-200">Edit</button></td>
              </tr>))}</tbody></table></div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">The amount actually charged is the price configured at the payment provider (Stripe) for the linked price ID; keep both the same. Payments need the STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET secrets on the “billing” Edge Function.</p>
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h2 className="text-sm font-semibold text-white">Subscriptions</h2>
          <div className="flex gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg bg-white/[0.04] border border-white/[0.1] px-2 py-1 text-xs text-white">
              <option value="">All statuses</option>{['active', 'trial', 'past_due', 'cancelled', 'expired'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button onClick={() => { setFormErr(''); setOf({ userId: '', email: '', plan: '', status: 'active', end: '', reason: '' }) }} className="text-xs rounded-lg border border-amber-400/40 text-amber-300 px-3 py-1">Manual override</button>
          </div>
        </div>
        {!subs ? <p className="text-xs text-slate-500">Loading…</p> : !subs.length ? <p className="text-xs text-slate-400">No subscriptions yet. Every client is on the free plan.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Client</th><th className="pr-3">Plan</th><th className="pr-3">Access</th><th className="pr-3">Status</th><th className="pr-3">Started</th><th className="pr-3">Renews / ends</th><th className="pr-3">Source</th><th /></tr></thead>
            <tbody>{subs.map(s => (
              <tr key={s.user_id} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3">{s.full_name || '—'}<div className="text-slate-500">{s.email}</div></td>
                <td className="pr-3">{s.plan_id || '—'}</td>
                <td className={`pr-3 font-semibold ${TONE[s.entitlement] || ''}`}>{s.entitlement}</td>
                <td className="pr-3">{s.status}{s.cancel_at_period_end && <div className="text-slate-500">cancels at period end</div>}</td>
                <td className="pr-3">{d(s.current_period_start)}</td>
                <td className="pr-3">{d(s.current_period_end)}</td>
                <td className="pr-3">{s.source === 'payment' ? `Payment (${s.provider || 'provider'})` : <span className="text-amber-300">Admin override</span>}</td>
                <td><button onClick={() => { setFormErr(''); setOf({ userId: s.user_id, email: s.email || '', plan: s.plan_id || '', status: s.status === 'past_due' ? 'active' : s.status, end: '', reason: '' }) }} className="text-violet-300 hover:text-violet-200">Override</button></td>
              </tr>))}</tbody></table></div>
        )}
      </section>

      {sf && (
        <AdminModal title="Limits & Premium features" busy={busy} err={formErr} onClose={() => setSf(null)}
          onSave={() => run('admin_update_premium_settings', { p_free_auto: Number(sf.fa), p_premium_auto: Number(sf.pa), p_free_wl: Number(sf.fw), p_premium_wl: Number(sf.pw), p_premium_timeframes: sf.tfs, p_reason: sf.reason }, () => setSf(null))}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Free: active automations"><input className={field} value={sf.fa} onChange={e => setSf({ ...sf, fa: e.target.value })} /></Field>
            <Field label="Premium: active automations"><input className={field} value={sf.pa} onChange={e => setSf({ ...sf, pa: e.target.value })} /></Field>
            <Field label="Free: watchlist assets"><input className={field} value={sf.fw} onChange={e => setSf({ ...sf, fw: e.target.value })} /></Field>
            <Field label="Premium: watchlist assets"><input className={field} value={sf.pw} onChange={e => setSf({ ...sf, pw: e.target.value })} /></Field>
          </div>
          <Field label="Premium-only chart timeframes">
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">{TFS.map(tf => <label key={tf} className="flex items-center gap-1"><input type="checkbox" checked={sf.tfs.includes(tf)} onChange={e => setSf({ ...sf, tfs: e.target.checked ? [...sf.tfs, tf] : sf.tfs.filter(x => x !== tf) })} />{tf}</label>)}</div>
          </Field>
          <Field label="Reason (audit log)"><input className={field} value={sf.reason} onChange={e => setSf({ ...sf, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
      {pf && (
        <AdminModal title={pf.isNew ? 'New plan' : `Edit ${pf.id}`} busy={busy} err={formErr} onClose={() => setPf(null)}
          onSave={() => run('admin_upsert_plan_v2', { p_id: pf.id, p_name: pf.name, p_interval: pf.period === 'year' ? 'year' : 'month', p_period: pf.period, p_tier: pf.tier, p_price: Number(pf.price), p_currency: pf.currency, p_promo_price: pf.promo ? Number(pf.promo) : null, p_promo_label: pf.promoLabel, p_provider_price_id: pf.priceId, p_description: pf.description, p_features: pf.features.split('\n').map(x => x.trim()).filter(Boolean), p_highlighted: pf.highlighted, p_enabled: pf.enabled, p_sort: Number(pf.sort) || 0, p_reason: pf.reason }, () => setPf(null))}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plan ID (a-z, 0-9, -)"><input className={field} value={pf.id} disabled={!pf.isNew} onChange={e => setPf({ ...pf, id: e.target.value.toLowerCase() })} placeholder="monthly" /></Field>
            <Field label="Name"><input className={field} value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="Premium Monthly" /></Field>
            <Field label="Billing period"><select className={field} value={pf.period} onChange={e => setPf({ ...pf, period: e.target.value })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Field>
            <Field label="Tier"><select className={field} value={pf.tier} onChange={e => setPf({ ...pf, tier: e.target.value })}><option value="standard">Standard</option><option value="premium">Premium</option><option value="pro">Pro</option></select></Field>
            <Field label="Currency"><input className={field} value={pf.currency} onChange={e => setPf({ ...pf, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Price"><input className={field} inputMode="decimal" value={pf.price} onChange={e => setPf({ ...pf, price: e.target.value })} /></Field>
            <Field label="Sort order"><input className={field} value={pf.sort} onChange={e => setPf({ ...pf, sort: e.target.value })} /></Field>
            <Field label="Promotional price (optional)"><input className={field} inputMode="decimal" value={pf.promo} onChange={e => setPf({ ...pf, promo: e.target.value })} /></Field>
            <Field label="Promotion label"><input className={field} value={pf.promoLabel} onChange={e => setPf({ ...pf, promoLabel: e.target.value })} /></Field>
          </div>
          <Field label="Short description"><input className={field} value={pf.description} maxLength={300} onChange={e => setPf({ ...pf, description: e.target.value })} /></Field>
          <Field label="Features (one per line)"><textarea rows={4} className={field} value={pf.features} onChange={e => setPf({ ...pf, features: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={pf.highlighted} onChange={e => setPf({ ...pf, highlighted: e.target.checked })} /> Highlight as recommended</label>
          <p className="text-[11px] text-slate-500">To take payment through SeerBit, attach a payment link with the same amount and currency in Payments. A plan with neither a SeerBit link nor a Stripe price shows “Not available yet”.</p>
          <Field label="Stripe price ID (price_…, optional)"><input className={`${field} font-mono`} value={pf.priceId} onChange={e => setPf({ ...pf, priceId: e.target.value.trim() })} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={pf.enabled} onChange={e => setPf({ ...pf, enabled: e.target.checked })} /> Shown to clients</label>
          <Field label="Reason (audit log)"><input className={field} value={pf.reason} onChange={e => setPf({ ...pf, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
      {of && (
        <AdminModal title="Manual Premium override" saveLabel="Apply override" busy={busy} err={formErr} onClose={() => setOf(null)}
          onSave={() => (of.userId ? run('admin_set_subscription_override', { p_user: of.userId, p_plan: of.plan || null, p_status: of.status, p_period_end: of.end ? new Date(of.end).toISOString() : null, p_reason: of.reason }, () => setOf(null)) : findClient())}>
          <p className="text-xs text-amber-300/90">For support cases only. This is recorded as an admin override (not a payment), in the audit log and the subscription history. It does not charge or refund the client at the payment provider.</p>
          {!of.userId ? (
            <Field label="Client email"><div className="flex gap-2"><input className={field} value={of.email} onChange={e => setOf({ ...of, email: e.target.value })} /><button type="button" onClick={findClient} className="rounded-lg border border-white/[0.1] px-3 text-xs text-slate-300">Find</button></div></Field>
          ) : <p className="text-sm text-white">{of.email || of.userId}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Status"><select className={field} value={of.status} onChange={e => setOf({ ...of, status: e.target.value })}>{['active', 'trial', 'cancelled', 'expired'].map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Plan"><select className={field} value={of.plan} onChange={e => setOf({ ...of, plan: e.target.value })}><option value="">—</option>{(plans || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          </div>
          {(of.status === 'active' || of.status === 'trial') && <Field label="Access until"><input type="date" className={field} value={of.end} onChange={e => setOf({ ...of, end: e.target.value })} /></Field>}
          <Field label="Reason (required, audit log)"><input className={field} value={of.reason} onChange={e => setOf({ ...of, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
    </AdminLayout>
  )
}

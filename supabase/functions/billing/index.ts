// Tarafab Premium billing (Stripe).
//
// Premium is activated only by a payment-provider event whose signature has
// been verified here (Stripe webhook, HMAC-SHA256 with STRIPE_WEBHOOK_SECRET).
// Clicking "Upgrade" only opens Stripe Checkout; nothing is unlocked until
// Stripe reports the subscription as active. Replayed events are ignored
// (billing_apply_subscription records each Stripe event id once).
//
// Secrets (Supabase → Edge Functions → billing):
//   STRIPE_SECRET_KEY      sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET  whsec_... (endpoint: <project>/functions/v1/billing)
//   APP_URL                optional, defaults to https://terafabxai.xyz
// Without them, checkout reports "not configured" and nothing changes.
//
// Client actions (signed-in user, JSON body): status | checkout | cancel | resume
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_KEY = (Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
const WEBHOOK_SECRET = (Deno.env.get('STRIPE_WEBHOOK_SECRET') || '').trim()
const APP_URL = (Deno.env.get('APP_URL') || 'https://terafabxai.xyz').replace(/\/$/, '')
const STRIPE = Deno.env.get('STRIPE_API_BASE') || 'https://api.stripe.com/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// ---------- pure helpers (exported for tests) ----------
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
export async function verifyStripeSignature(payload: string, header: string, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!secret || !header) return false
  const parts = header.split(',').map(p => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))
  return sigs.some(s => safeEqual(s, expected))
}

type StripeSub = { id: string; status: string; customer: string; cancel_at_period_end?: boolean; metadata?: Record<string, string>;
  current_period_start?: number; current_period_end?: number; items?: { data?: { current_period_start?: number; current_period_end?: number }[] } }

// Stripe subscription → Tarafab entitlement row. null = do not change access.
export function mapSubscription(s: StripeSub) {
  const status = ({ active: 'active', trialing: 'trial', past_due: 'past_due', unpaid: 'past_due', paused: 'past_due', canceled: 'cancelled', incomplete_expired: 'expired' } as Record<string, string>)[s.status]
  if (!status) return null // 'incomplete': payment not confirmed yet
  const item = s.items?.data?.[0]
  const start = s.current_period_start ?? item?.current_period_start
  const end = s.current_period_end ?? item?.current_period_end
  return {
    user: s.metadata?.user_id || null, plan: s.metadata?.plan_id || null, status,
    customer: typeof s.customer === 'string' ? s.customer : null, subscription: s.id,
    period_start: start ? new Date(start * 1000).toISOString() : null,
    period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!s.cancel_at_period_end,
  }
}

async function stripe(path: string, params?: Record<string, string>, method = params ? 'POST' : 'GET') {
  const r = await fetch(`${STRIPE}${path}`, {
    method, headers: { Authorization: `Bearer ${STRIPE_KEY}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(15_000),
  })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b?.error?.message || `Payment provider responded ${r.status}`)
  return b
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // ---------- Stripe webhook ----------
  const sigHeader = req.headers.get('stripe-signature')
  if (sigHeader) {
    const raw = await req.text()
    if (!WEBHOOK_SECRET || !(await verifyStripeSignature(raw, sigHeader, WEBHOOK_SECRET))) return json({ error: 'Invalid signature' }, 400)
    const ev = JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, unknown> } }
    let sub: StripeSub | null = null
    if (ev.type.startsWith('customer.subscription.')) sub = ev.data.object as unknown as StripeSub
    else if (ev.type === 'checkout.session.completed' || ev.type === 'invoice.paid' || ev.type === 'invoice.payment_failed') {
      const id = (ev.data.object.subscription as string) || ((ev.data.object as { parent?: { subscription_details?: { subscription?: string } } }).parent?.subscription_details?.subscription)
      if (id && STRIPE_KEY) sub = await stripe(`/subscriptions/${encodeURIComponent(id)}`)
    }
    if (!sub) return json({ received: true, ignored: ev.type })
    const m = mapSubscription(sub)
    if (!m) return json({ received: true, pending: sub.status })
    if (!m.user) return json({ received: true, ignored: 'no user metadata' })
    const { error } = await db.rpc('billing_apply_subscription', {
      p_event_id: ev.id, p_event_type: ev.type, p_user: m.user, p_plan: m.plan, p_status: m.status, p_provider: 'stripe',
      p_customer: m.customer, p_subscription: m.subscription, p_period_start: m.period_start, p_period_end: m.period_end,
      p_cancel_at_period_end: m.cancel_at_period_end, p_details: { stripe_status: sub.status },
    })
    if (error) return json({ error: 'Could not record the event.' }, 500) // Stripe retries
    return json({ received: true })
  }

  // ---------- signed-in client ----------
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u } = token ? await db.auth.getUser(token) : { data: { user: null } }
  if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
  const body = await req.json().catch(() => ({})) as { action?: string; plan_id?: string }
  const configured = !!STRIPE_KEY && !!WEBHOOK_SECRET
  if (body.action === 'status') return json({ configured })
  if (!configured) return json({ error: 'Premium payments are not available yet.', code: 'not_configured' }, 503)
  // Admin -> Feature Control Center -> Premium OFF: no new or resumed
  // subscriptions. Cancelling stays possible so nobody is kept on billing.
  if (body.action === 'checkout' || body.action === 'resume') {
    const { data: fs, error: fe } = await db.rpc('feature_state', { p_key: 'premium' })
    if (fe || ['disabled', 'unavailable', 'admin_only'].includes(String(fs))) return json({ error: 'This feature is not available right now.', code: 'FEATURE_DISABLED' }, 403)
  }

  const { data: current } = await db.from('subscriptions').select('*').eq('user_id', u.user.id).maybeSingle()
  try {
    if (body.action === 'checkout') {
      const { data: plan } = await db.from('premium_plans').select('id, provider_price_id, enabled').eq('id', body.plan_id || '').maybeSingle()
      if (!plan?.enabled || !plan.provider_price_id) return json({ error: 'This plan is not available.' }, 400)
      const { data: isPrem } = await db.rpc('_is_premium', { p_user: u.user.id })
      if (isPrem && current?.source === 'payment') return json({ error: 'You already have Tarafab Premium.' }, 409)
      let customer = current?.provider_customer_id as string | undefined
      if (!customer) {
        const c = await stripe('/customers', { email: u.user.email || '', 'metadata[user_id]': u.user.id })
        customer = c.id as string
      }
      const s = await stripe('/checkout/sessions', {
        mode: 'subscription', customer: customer!, client_reference_id: u.user.id,
        'line_items[0][price]': plan.provider_price_id, 'line_items[0][quantity]': '1',
        'metadata[user_id]': u.user.id, 'metadata[plan_id]': plan.id,
        'subscription_data[metadata][user_id]': u.user.id, 'subscription_data[metadata][plan_id]': plan.id,
        success_url: `${APP_URL}/dashboard?premium=success#premium`, cancel_url: `${APP_URL}/dashboard#premium`,
      })
      return json({ url: s.url })
    }
    if (body.action === 'cancel' || body.action === 'resume') {
      if (current?.source !== 'payment' || !current.provider_subscription_id) return json({ error: 'There is no paid subscription to change.' }, 400)
      await stripe(`/subscriptions/${encodeURIComponent(current.provider_subscription_id)}`, { cancel_at_period_end: body.action === 'cancel' ? 'true' : 'false' })
      return json({ ok: true, pending: true })
    }
    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message.slice(0, 200) : 'Payment provider error.' }, 502)
  }
})

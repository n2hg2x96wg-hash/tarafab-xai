import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { gatewayKey, visitorCountry } from '@/lib/payments'
import { paystackInitialize, paystackSecret, recordPaystackResult } from '@/lib/paystack'

// Paystack plan payment. Order: signed in → country (server-side) → plan,
// price and currency from the database → Paystack transaction (secret key,
// server only) → authorization URL. Outside Nigeria nothing is created at
// Paystack. The browser sends only the plan id.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`paystack-start:${clientIp(request)}`, 10, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const plan = String(b.plan_id ?? '')
  if (!/^[a-z0-9_-]{2,40}$/.test(plan)) return NextResponse.json({ error: 'Choose a plan.' }, { status: 400 })
  const noStore = { headers: { 'Cache-Control': 'no-store' } }
  if (gatewayKey().length < 32 || !paystackSecret()) {
    console.error('paystack: not configured', { gatewayKey: gatewayKey().length >= 32, secret: !!paystackSecret() })
    return NextResponse.json({ status: 'unavailable' }, noStore)
  }
  const country = visitorCountry(request)
  const { data, error } = await supabase.rpc('gateway_start_paystack', { p_key: gatewayKey(), p_plan: plan, p_country: country || '', p_idempotency_key: idempotencyKey(request, b as { idempotency_key?: unknown }) })
  if (error) return dbError(error)
  const r = data as { status: string; reference?: string; amount?: number; currency?: string; email?: string; plan_id?: string; plan_name?: string }
  if (r.status !== 'ok' || !r.reference) return NextResponse.json({ status: r.status }, noStore)
  const { data: who } = await supabase.auth.getUser()
  try {
    const init = await paystackInitialize({ email: r.email!, amount: Number(r.amount), currency: r.currency!, reference: r.reference, planId: r.plan_id!, planName: r.plan_name!, userId: who.user?.id || '' })
    const url = init.data?.authorization_url
    if (!init.status || !url || !/^https:\/\/checkout\.paystack\.com\//.test(url)) {
      // Most common causes: currency not enabled on the Paystack account,
      // test/live key mismatch, or an invalid key. Logged without secrets.
      console.error('paystack: initialize failed', r.reference, init.message)
      await recordPaystackResult(r.reference, 'init_failed', null, r.currency || null, null, `Initialization failed: ${init.message}`)
      return NextResponse.json({ status: 'error', error: 'The payment could not be started. Please try again later.' }, { status: 502, ...noStore })
    }
    return NextResponse.json({ status: 'ok', url, reference: r.reference }, noStore)
  } catch {
    console.error('paystack: initialize unreachable', r.reference)
    await recordPaystackResult(r.reference, 'init_failed', null, r.currency || null, null, 'Paystack could not be reached')
    return NextResponse.json({ status: 'error', error: 'The payment service could not be reached. Please try again.' }, { status: 503, ...noStore })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { gatewayKey, visitorCountry } from '@/lib/payments'

// Payment-access gateway. Order: signed in → country (server-side) → plan,
// amount, currency, availability (database) → only then the payment URL.
// The browser sends only the plan id; amount and currency come from the plan.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`pay-start:${clientIp(request)}`, 10, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const plan = String(b.plan_id ?? '')
  if (!/^[a-z0-9_-]{2,40}$/.test(plan)) return NextResponse.json({ error: 'Choose a plan.' }, { status: 400 })
  // Optional hardening key; the database decides whether it is required.
  const key = gatewayKey()
  const country = visitorCountry(request)
  const { data, error } = await supabase.rpc('gateway_start_payment', { p_key: key, p_plan: plan, p_country: country || '', p_idempotency_key: idempotencyKey(request, b as { idempotency_key?: unknown }) })
  if (error) return dbError(error)
  const r = data as { status: string; url?: string; reference?: string; amount?: number; currency?: string }
  // The destination is returned only for an approved request.
  if (r.status !== 'ok' || !r.url || !/^https:\/\/pay\.seerbitapi\.com\/[A-Za-z0-9_-]+$/.test(r.url)) {
    return NextResponse.json({ status: r.status === 'ok' ? 'unavailable' : r.status }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ status: 'ok', url: r.url, reference: r.reference, amount: r.amount, currency: r.currency }, { headers: { 'Cache-Control': 'no-store' } })
}

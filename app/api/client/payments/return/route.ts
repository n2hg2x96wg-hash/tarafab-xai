import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { verifyPayment } from '@/lib/payments'
import { verifyAndRecord } from '@/lib/paystack'

// Back from SeerBit. Records the outcome the page reports (never "paid") and
// asks the server-side verifier to confirm with SeerBit.
export async function POST(request: NextRequest) {
  const { supabase, token } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`pay-return:${clientIp(request)}`, 30, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const reference = String(b.reference ?? '')
  if (!/^PAY-[A-Z0-9]{12}$/.test(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 })
  const providerRef = String(b.provider_reference ?? '').slice(0, 80)
  const outcome = b.outcome === 'cancelled' ? 'cancelled' : 'returned'
  const { data: own, error: e0 } = await supabase.from('payment_attempts').select('provider').eq('reference', reference).maybeSingle()
  if (e0) return dbError(e0)
  if (!own) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  // Paystack's reference is our own; nothing from the URL is stored for it.
  const { error } = await supabase.rpc('client_payment_returned', { p_reference: reference, p_provider_reference: own.provider === 'paystack' ? null : providerRef || null, p_outcome: outcome })
  if (error) return dbError(error)
  if (outcome !== 'cancelled') { if (own.provider === 'paystack') await verifyAndRecord(reference); else await verifyPayment(token, reference) }
  const { data, error: e2 } = await supabase.from('payment_attempts').select('reference, provider, plan_id, expected_amount, currency, status, verification_status, created_at, verified_at').eq('reference', reference).maybeSingle()
  if (e2) return dbError(e2)
  return NextResponse.json({ payment: data })
}

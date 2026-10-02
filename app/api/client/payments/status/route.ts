import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { verifyPayment } from '@/lib/payments'
import { verifyAndRecord } from '@/lib/paystack'

// The caller's own payment (RLS), re-checked with SeerBit while pending.
export async function GET(request: NextRequest) {
  const { supabase, token } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const reference = request.nextUrl.searchParams.get('reference') || ''
  if (!/^PAY-[A-Z0-9]{12}$/.test(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 })
  const sel = 'reference, provider, plan_id, expected_amount, currency, status, verification_status, created_at, verified_at'
  let { data, error } = await supabase.from('payment_attempts').select(sel).eq('reference', reference).maybeSingle()
  if (error) return dbError(error)
  if (!data) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  if (data.status === 'pending_verification') {
    if (data.provider === 'paystack') await verifyAndRecord(reference); else await verifyPayment(token, reference)
    ;({ data, error } = await supabase.from('payment_attempts').select(sel).eq('reference', reference).maybeSingle())
    if (error) return dbError(error)
  }
  return NextResponse.json({ payment: data })
}

import { NextRequest, NextResponse } from 'next/server'
import { paystackSignatureValid, verifyAndRecord } from '@/lib/paystack'

// Paystack webhook. The signature is checked against the raw body; the event
// is then re-verified with Paystack's API before anything is recorded, so a
// forged or replayed body cannot mark a payment paid. Recording is
// idempotent (a reference is credited once).
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!paystackSignatureValid(raw, request.headers.get('x-paystack-signature'))) {
    console.warn('paystack webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  let ev: { event?: string; data?: { reference?: string } }
  try { ev = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const ref = ev.data?.reference || ''
  if (/^PAY-[A-Z0-9]{12}$/.test(ref) && /^(charge\.success|charge\.failed|refund\.processed|charge\.dispute\.create)$/.test(ev.event || '')) {
    const r = await verifyAndRecord(ref)
    console.info('paystack webhook:', ev.event, ref, r.status)
  }
  return NextResponse.json({ received: true })
}

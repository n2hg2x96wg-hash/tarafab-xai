import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, unauthorized } from '@/lib/supabase/request'
import { gatewayKey } from '@/lib/payments'
import { appUrl, paystackMode, paystackSecret, verifyAndRecord } from '@/lib/paystack'

async function requireAdmin(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return null
  const { data } = await supabase.rpc('is_admin')
  return data === true ? supabase : null
}

// Configuration status for the admin page (never the key itself).
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized()
  return NextResponse.json({ secretSet: !!paystackSecret(), mode: paystackMode(), gatewayKeySet: gatewayKey().length >= 32,
    callbackUrl: `${appUrl()}/payment/return?provider=paystack`, webhookUrl: `${appUrl()}/api/webhooks/paystack` }, { headers: { 'Cache-Control': 'no-store' } })
}

// Admin "Verify with Paystack" for one reference.
export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 })
  const b = await request.json().catch(() => ({})) as { reference?: string }
  if (!/^PAY-[A-Z0-9]{12}$/.test(String(b.reference || ''))) return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 })
  return NextResponse.json(await verifyAndRecord(String(b.reference)))
}

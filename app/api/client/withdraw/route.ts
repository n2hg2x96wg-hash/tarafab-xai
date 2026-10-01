import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  // Hiding this section in the admin menu settings also switches it off here,
  // so it cannot be used by calling the API directly.
  const { data: off } = await supabase.rpc('client_nav_is_hidden', { p_section: 'withdraw' })
  if (off === true) return NextResponse.json({ error: 'This feature is currently unavailable. Please contact support.' }, { status: 403 })

  try {
    const body = await request.json() as { amount: number; source: string; address?: string; wallet_id?: string; notes?: string; idempotency_key?: string }
    const { amount, source, address, wallet_id, notes } = body
    if (typeof amount !== 'number' || !(amount > 0)) return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })

    const key = idempotencyKey(request, body)
    const { data, error } = wallet_id
      ? await supabase.rpc('client_request_withdrawal_to_wallet', {
        p_amount: amount,
        p_source: source,
        p_wallet_id: wallet_id,
        p_notes: notes?.trim() || null,
        p_idempotency_key: key,
      })
      : await supabase.rpc('client_request_withdrawal', {
        p_amount: amount,
        p_source: source,
        p_address: String(address || '').trim(),
        p_notes: notes?.trim() || null,
        p_idempotency_key: key,
      })
    if (error) return dbError(error)
    return NextResponse.json({ withdrawal: { id: data.id, reference: data.reference, status: data.status } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

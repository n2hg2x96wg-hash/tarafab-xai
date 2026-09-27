import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const { amount, source, address, notes } = await request.json() as { amount: number; source: string; address: string; notes?: string }
    if (typeof amount !== 'number' || !(amount > 0)) return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })

    const { data, error } = await supabase.rpc('client_request_withdrawal', {
      p_amount: amount,
      p_source: source,
      p_address: String(address || '').trim(),
      p_notes: notes?.trim() || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ withdrawal: { id: data.id, reference: data.reference, status: data.status } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

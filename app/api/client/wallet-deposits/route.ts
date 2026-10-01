import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'

export async function GET() {
  const { supabase } = clientForRequest(new NextRequest('http://localhost'))
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('wallet_deposit_configs')
    .select('id,chain_id,network,asset,symbol,receiving_address,fee_bps,fixed_fee,min_amount,max_amount,confirmations')
    .eq('enabled', true).order('chain_id', { ascending: true })
  if (error) return dbError(error)
  return NextResponse.json({ configs: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  try {
    const body = await request.json() as { wallet_id?: string; amount?: number }
    const walletId = String(body.wallet_id || '').trim()
    const amount = Number(body.amount)
    if (!/^[0-9a-f-]{36}$/i.test(walletId) || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Choose a wallet and enter a valid amount.' }, { status: 400 })
    const key = idempotencyKey(request, body)
    const { data, error } = await supabase.rpc('client_create_wallet_deposit_intent', { p_wallet_id: walletId, p_amount: amount, p_idempotency_key: key })
    if (error) return dbError(error)
    return NextResponse.json({ intent: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request.' }, { status: 400 })
  }
}

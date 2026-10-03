import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Tarafab Service Fee for an amount, calculated by the database with the
// active admin-configured rule (the same calculation used when charging).
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const p = request.nextUrl.searchParams
  const service = p.get('service') || ''
  const amount = Number(p.get('amount'))
  if (!['withdrawal', 'wallet_transfer'].includes(service) || !(amount > 0) || amount > 1e12) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  // Withdrawals: the destination network decides the rule scope (same
  // mapping the database uses when it charges the fee).
  // A linked & verified wallet destination is an External Wallet Transfer;
  // the database decides this (and the scope) from the wallet id.
  const network = (p.get('network') || '').slice(0, 40)
  const walletId = p.get('wallet_id') || ''
  if (walletId && !/^[0-9a-f-]{36}$/i.test(walletId)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  if (service === 'withdrawal' && (network || walletId)) {
    const { data, error } = await supabase.rpc('quote_withdrawal_fee_v2', { p_network: network || null, p_amount: amount, p_wallet_id: walletId || null })
    if (error) { console.error('fees: withdrawal quote failed', error.message); return dbError(error) }
    return NextResponse.json({ quote: data })
  }
  const chain = p.get('chain_id') ? Number(p.get('chain_id')) : null
  const { data, error } = await supabase.rpc('quote_service_fee', { p_service: service, p_asset: p.get('asset') || null, p_chain_id: Number.isInteger(chain) ? chain : null, p_amount: amount })
  if (error) { console.error('fees: quote failed', error.message); return dbError(error) }
  return NextResponse.json({ quote: data })
}

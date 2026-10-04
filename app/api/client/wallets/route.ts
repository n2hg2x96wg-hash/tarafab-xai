import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { limitUser } from '@/lib/userRateLimit'

// The client's own linked external wallets. Row-level security returns only
// the caller's rows; nothing here can read or change another client's wallet.
// Only public metadata exists: there are no keys or recovery phrases to return.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('client_wallets')
    .select('id, chain_id, network, address, label, wallet_name, status, verification_status, linked_at, verified_at, last_verified_at, ended_at, end_reason')
    .order('created_at', { ascending: false }).limit(50)
  if (error) return dbError(error)
  return NextResponse.json({ wallets: data || [] })
}

// action 'challenge': a single-use message for the wallet to sign.
// action 'unlink': disconnect one of the caller's own wallets (history kept).
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const limited = await limitUser(supabase, 'wallets', 20, 600); if (limited) return limited }
  // Switched off in Admin → Feature controls: refused here too, not only hidden.
  { const blocked = await featureBlocked(supabase, 'wallet'); if (blocked) return blocked }
  const limited = rateLimited(`wallets:${clientIp(request)}`, 30, 10 * 60_000)
  if (limited) return limited
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (body.action === 'challenge') {
    const chainId = Number(body.chain_id)
    if (!Number.isInteger(chainId) || chainId <= 0) return NextResponse.json({ error: 'This network is not supported yet.' }, { status: 400 })
    const { data, error } = await supabase.rpc('client_wallet_challenge', { p_address: String(body.address ?? ''), p_chain_id: chainId })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  if (body.action === 'unlink') {
    const { data, error } = await supabase.rpc('client_unlink_wallet', { p_wallet: String(body.wallet_id ?? '') })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

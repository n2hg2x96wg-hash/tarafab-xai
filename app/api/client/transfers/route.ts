import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { functionsUrl, getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLS = 'id, reference, wallet_id, chain_id, network, asset, token_contract, decimals, from_address, to_address, quoted_amount, usd_rate, quoted_usd, quoted_fee_usd, quoted_credit_usd, quote_expires_at, tx_hash, submitted_at, required_confirmations, confirmations, received_amount, credit_rate, gross_usd, fee_usd, credited_usd, status, error, created_at, credited_at'

// External wallet → Tarafab transfers. Amounts, prices and fees are worked
// out by the database (client_transfer_quote); crediting happens only in the
// transfer-verify Edge Function after the blockchain transaction is checked.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const [t, d] = await Promise.all([
    supabase.from('wallet_transfers').select(COLS).order('created_at', { ascending: false }).limit(50),
    supabase.from('deposit_addresses').select('id, chain_id, network, asset, token_contract, decimals, address, min_confirmations').eq('enabled', true).order('chain_id'),
  ])
  if (t.error) return dbError(t.error)
  if (d.error) return dbError(d.error)
  return NextResponse.json({ transfers: t.data || [], destinations: d.data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase, token } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`transfers:${clientIp(request)}`, 30, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(b.id ?? '')
  switch (b.action) {
    case 'quote': {
      const amount = String(b.amount ?? '')
      if (!UUID.test(String(b.wallet_id ?? '')) || !UUID.test(String(b.destination_id ?? '')) || !/^\d+(\.\d{1,18})?$/.test(amount) || !(Number(amount) > 0)) {
        return NextResponse.json({ error: 'Check the wallet, asset and amount.' }, { status: 400 })
      }
      const { data, error } = await supabase.rpc('client_transfer_quote', { p_wallet_id: b.wallet_id, p_deposit_address_id: b.destination_id, p_amount: amount, p_idempotency_key: idempotencyKey(request, b as { idempotency_key?: unknown }) })
      if (error) return dbError(error)
      return NextResponse.json({ transfer: data })
    }
    case 'submit': {
      const hash = String(b.tx_hash ?? '').toLowerCase()
      if (!UUID.test(id) || !/^0x[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: 'Invalid transaction.' }, { status: 400 })
      const { data, error } = await supabase.rpc('client_transfer_submit', { p_id: id, p_tx_hash: hash })
      if (error) return dbError(error)
      void check(token, id) // start verifying right away; the scheduler continues every minute
      return NextResponse.json({ transfer: data })
    }
    case 'cancel': {
      if (!UUID.test(id)) return NextResponse.json({ error: 'Transfer not found.' }, { status: 400 })
      const { data, error } = await supabase.rpc('client_transfer_cancel', { p_id: id })
      if (error) return dbError(error)
      return NextResponse.json({ transfer: data })
    }
    case 'check': {
      if (!UUID.test(id)) return NextResponse.json({ error: 'Transfer not found.' }, { status: 400 })
      await check(token, id)
      const { data, error } = await supabase.from('wallet_transfers').select(COLS).eq('id', id).maybeSingle()
      if (error) return dbError(error)
      return NextResponse.json({ transfer: data })
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
}

async function check(token: string, id: string) {
  try {
    await fetch(`${functionsUrl()}/transfer-verify`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: getSupabaseEnv().anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }), signal: AbortSignal.timeout(25_000), cache: 'no-store',
    })
  } catch { /* the scheduled check retries */ }
}

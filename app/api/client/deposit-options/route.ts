import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, unauthorized } from '@/lib/supabase/request'

// Crypto deposit options from Admin → Fees & Transfers → Tarafab receiving
// addresses (enabled records only; the address is a public destination).
// No internal ids or admin metadata are returned.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('deposit_addresses')
    .select('asset, network, chain_id, address, min_confirmations, token_contract').eq('enabled', true)
  if (error) {
    console.error('deposit-options: could not read receiving addresses', error.message)
    return NextResponse.json({ error: 'Deposit options are temporarily unavailable.' }, { status: 503 })
  }
  const eth = (data || []).find(d => d.asset === 'ETH' && d.chain_id === 1 && !d.token_contract)
  const valid = eth && /^0x[0-9a-f]{40}$/.test(eth.address)
  return NextResponse.json({
    ethereum: eth ? (valid ? { asset: 'ETH', network: 'Ethereum', address: eth.address, min_confirmations: eth.min_confirmations } : { unavailable: true }) : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

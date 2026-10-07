import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, unauthorized } from '@/lib/supabase/request'

// Crypto deposit options from Admin → Fees & Transfers → Tarafab receiving
// addresses. Every ENABLED record is offered if it validates: supported
// network, address, asset, token contract (required for non-native assets),
// decimals and confirmations. The address is a public destination; no
// internal ids or admin metadata are returned.
import { validOption, type DepositOption, type Row } from '@/lib/depositOptions'

export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('deposit_addresses')
    .select('asset, network, chain_id, address, min_confirmations, token_contract, decimals').eq('enabled', true).order('chain_id')
  if (error) {
    console.error('deposit-options: could not read receiving addresses', error.message)
    return NextResponse.json({ error: 'Deposit options are temporarily unavailable.' }, { status: 503 })
  }
  const rows = (data || []) as Row[]
  const options: DepositOption[] = []
  for (const r of rows) {
    // Manual, admin-reviewed deposits: an empty token contract is filled with
    // the network's official contract so the option is not silently lost.
    const o = validOption(r, { canonical: true })
    if (o) options.push(o)
    else console.warn('deposit-options: enabled receiving address skipped (invalid or unsupported)', { asset: r.asset, chain_id: r.chain_id })
  }
  // `ethereum` kept for callers of the earlier response shape.
  const ethRow = rows.find(d => String(d.asset).toUpperCase() === 'ETH' && d.chain_id === 1)
  const eth = options.find(o => o.asset === 'ETH' && o.chain_id === 1)
  return NextResponse.json({ options, invalid: rows.length - options.length,
    ethereum: eth ? { asset: 'ETH', network: 'Ethereum', address: eth.address, min_confirmations: eth.min_confirmations } : ethRow ? { unavailable: true } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

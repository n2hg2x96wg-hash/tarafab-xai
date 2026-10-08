import { NextRequest, NextResponse } from 'next/server'
import { featureBlocked } from '@/lib/features'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { limitUser } from '@/lib/userRateLimit'
import { readBalances, type WalletBalances } from '@/lib/wallet/onchain'

export const dynamic = 'force-dynamic'

// On-chain balances of the caller's own linked wallets (row-level security
// returns only their rows), read-only over public JSON-RPC. No wallet app,
// signature or transaction is involved, and nothing about the Tarafab
// account balance is read or changed here.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const blocked = await featureBlocked(supabase, 'wallet'); if (blocked) return blocked }
  { const limited = await limitUser(supabase, 'wallet-balance', 60, 600); if (limited) return limited }
  const { data, error } = await supabase.from('client_wallets')
    .select('id, chain_id, address').eq('status', 'linked').order('created_at', { ascending: false }).limit(10)
  if (error) return dbError(error)
  const balances: (WalletBalances & { wallet_id: string })[] = []
  await Promise.all((data || []).map(async w => {
    const b = await readBalances(Number(w.chain_id), String(w.address))
    if (b) balances.push({ wallet_id: w.id, ...b })
  }))
  return NextResponse.json({ balances }, { headers: { 'Cache-Control': 'no-store' } })
}

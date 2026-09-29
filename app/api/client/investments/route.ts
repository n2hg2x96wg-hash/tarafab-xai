import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Read-only view of the Investment Center for the signed-in client. Every
// query runs as the client, so row level security decides what is visible:
// active products with their current published terms, and only this client's
// own investments. There is no write endpoint: investing is not enabled.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  const [products, investments, kyc] = await Promise.all([
    supabase.from('investment_products').select('id, code, status, current_version_id').eq('status', 'active').order('created_at'),
    supabase.from('client_investments')
      .select('id, product_id, product_version_id, principal, fee_amount, currency, status, start_date, maturity_date, created_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.rpc('client_kyc_status'),
  ])
  if (products.error) return dbError(products.error)
  if (investments.error) return dbError(investments.error)

  const invs = investments.data || []
  // Terms: the current version of each active product, plus the exact version
  // behind each of the client's own investments.
  const versionIds = Array.from(new Set([
    ...(products.data || []).map(p => p.current_version_id).filter(Boolean),
    ...invs.map(i => i.product_version_id),
  ])) as string[]
  const versions = versionIds.length
    ? await supabase.from('investment_product_versions')
        .select('id, product_id, version, name, description, currency, min_amount, max_amount, term_days, risk_level, risk_disclosure, terms_text, entry_fee_pct, return_type, return_rate_pct, eligibility, published_at')
        .in('id', versionIds)
    : { data: [], error: null }
  if (versions.error) return dbError(versions.error)

  // Realised returns come only from real ledger rows linked to an investment.
  let returns: { client_investment_id: string; amount: number }[] = []
  if (invs.length) {
    const links = await supabase.from('investment_transactions')
      .select('client_investment_id, kind, transactions(amount, status)')
      .in('client_investment_id', invs.map(i => i.id)).eq('kind', 'return')
    if (links.error) return dbError(links.error)
    returns = (links.data || [])
      .map(l => ({ l, tx: Array.isArray(l.transactions) ? l.transactions[0] : l.transactions as { amount: number; status: string } | null }))
      .filter(({ tx }) => tx && ['completed', 'approved'].includes(tx.status))
      .map(({ l, tx }) => ({ client_investment_id: l.client_investment_id, amount: Number(tx!.amount) }))
  }

  const kycStatus = kyc.error ? null : (kyc.data as { status?: string; has_submission?: boolean } | null)
  return NextResponse.json({
    products: products.data || [],
    versions: versions.data || [],
    investments: invs,
    returns,
    kyc_verified: !!kycStatus && kycStatus.has_submission !== false && kycStatus.status === 'verified',
    // Stated plainly so the interface never implies otherwise.
    investing_enabled: false,
  })
}

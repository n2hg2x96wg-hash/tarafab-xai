import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { parseInvestmentSummary } from '@/lib/investmentSummary'

// Read-only view of the Investment Center for the signed-in client. Every
// query runs as the client, so row level security decides what is visible:
// active products with their current published terms, and only this client's
// own investments. Writes (submit / cancel a pending request) go through
// database functions that re-check everything server-side: sign-in, KYC,
// product status, limits and the real account balance.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return unauthorized()

  const [products, investments, kyc, account, summary] = await Promise.all([
    supabase.from('investment_products').select('id, code, status, current_version_id').eq('status', 'active').order('created_at'),
    supabase.from('client_investments')
      .select('id, reference, product_id, product_version_id, principal, fee_amount, profit_amount, return_type, return_rate_pct, return_amount, expected_return, expected_total, currency, status, start_date, maturity_date, completed_at, rejection_reason, reviewed_at, created_at')
      .eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(100),
    supabase.rpc('client_kyc_status'),
    // The one existing balance record; nothing here recalculates it.
    supabase.from('accounts').select('available_balance, pending_balance, invested_balance').eq('user_id', auth.user.id).maybeSingle(),
    // Same totals the Overview shows (client_investment_summary, all records).
    supabase.rpc('client_investment_summary'),
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
        .select('id, product_id, version, name, description, currency, min_amount, max_amount, term_days, return_amount, duration_value, duration_unit, cancellation_allowed, cancellation_terms, risk_level, risk_disclosure, terms_text, entry_fee_pct, return_type, return_rate_pct, eligibility, published_at')
        .in('id', versionIds)
    : { data: [], error: null }
  if (versions.error) return dbError(versions.error)

  // Realised returns come only from real ledger rows linked to an investment.
  let returns: { client_investment_id: string; amount: number }[] = []
  if (invs.length) {
    const links = await supabase.from('investment_transactions')
      .select('client_investment_id, kind, transactions(amount, direction, status)')
      .in('client_investment_id', invs.map(i => i.id)).eq('kind', 'return')
    if (links.error) return dbError(links.error)
    returns = (links.data || [])
      .map(l => ({ l, tx: Array.isArray(l.transactions) ? l.transactions[0] : l.transactions as { amount: number; direction: string | null; status: string } | null }))
      .filter(({ tx }) => tx && ['completed', 'approved'].includes(tx.status) && ['credit', 'debit'].includes(tx.direction || ''))
      .map(({ l, tx }) => ({ client_investment_id: l.client_investment_id, amount: Number(tx!.amount) * (tx!.direction === 'debit' ? -1 : 1) }))
  }
  const profitByInvestment = new Map<string, number>()
  for (const row of returns) profitByInvestment.set(row.client_investment_id, (profitByInvestment.get(row.client_investment_id) || 0) + row.amount)
  const investmentsWithLedgerProfit = invs.map(inv => ({
    ...inv,
    profit_amount: profitByInvestment.get(inv.id) || 0,
  }))

  // Timeline and linked ledger rows for the client's own investments.
  let events: unknown[] = []
  let txs: unknown[] = []
  let adjustments: unknown[] = []
  if (invs.length) {
    const ids = invs.map(i => i.id)
    const [ev, tl, adj] = await Promise.all([
      supabase.from('client_investment_events').select('id, client_investment_id, from_status, to_status, reason, created_at')
        .in('client_investment_id', ids).order('created_at'),
      supabase.from('investment_transactions').select('client_investment_id, kind, transactions(id, type, amount, direction, status, reference, notes, created_at)')
        .in('client_investment_id', ids),
      // Profit history for the client's own investments (who adjusted it is not shown).
      supabase.from('investment_profit_adjustments').select('id, investment_id, transaction_id, previous_profit, new_profit, previous_value, new_value, reason, created_at')
        .in('investment_id', ids).order('created_at'),
    ])
    if (!adj.error) adjustments = adj.data || []
    if (!ev.error) events = ev.data || []
    if (!tl.error) txs = (tl.data || []).map(l => ({ client_investment_id: l.client_investment_id, kind: l.kind, tx: Array.isArray(l.transactions) ? l.transactions[0] : l.transactions }))
  }

  const kycStatus = kyc.error ? null : (kyc.data as { status?: string; has_submission?: boolean } | null)
  return NextResponse.json({
    products: products.data || [],
    versions: versions.data || [],
    investments: investmentsWithLedgerProfit,
    returns,
    events,
    transactions: txs,
    adjustments,
    balance: account.data ? {
      available: Number(account.data.available_balance), pending: Number(account.data.pending_balance), invested: Number(account.data.invested_balance),
    } : null,
    summary: parseInvestmentSummary(summary.error ? null : summary.data),
    kyc_verified: !!kycStatus && kycStatus.has_submission !== false && kycStatus.status === 'verified',
    // Investing opens only once an admin has made at least one product active.
    investing_enabled: (products.data || []).some(p => p.current_version_id),
  })
}

// Submit a new investment request or cancel one of the client's own pending
// requests. The amount is held from the available balance by the database
// function; the browser never calculates or sends a balance.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  // Switched off in Admin → Feature controls: refused here too, not only hidden.
  { const blocked = await featureBlocked(supabase, 'investments'); if (blocked) return blocked }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  if (body.action === 'submit') {
    const amount = Number(body.amount)
    const key = idempotencyKey(request, body)
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
    if (!key) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { data, error } = await supabase.rpc('client_submit_investment', {
      p_version_id: typeof body.version_id === 'string' ? body.version_id : null,
      p_amount: amount,
      p_accept_terms: body.accept_terms === true,
      p_idempotency_key: key,
    })
    if (error) return dbError(error)
    return NextResponse.json({ investment: data })
  }

  if (body.action === 'cancel') {
    const { data, error } = await supabase.rpc('client_cancel_investment', {
      p_investment_id: typeof body.investment_id === 'string' ? body.investment_id : null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ investment: data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

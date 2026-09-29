import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'

// Admin product management. Each action is a database function that checks
// the caller is an admin, validates the input and writes an audit entry.
// Reviewing a client investment (approve / reject / complete) moves money only
// between the client's existing account fields, inside the database function.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))
  const str = (v: unknown) => (typeof v === 'string' ? v : null)

  if (body.action === 'save') {
    const minAmount = num(body.min_amount)
    if (minAmount === null || !Number.isFinite(minAmount)) return NextResponse.json({ error: 'Minimum investment is required' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_save_product_draft_v2', {
      p_product_id: str(body.product_id),
      p_code: str(body.code),
      p_name: str(body.name),
      p_description: str(body.description),
      p_min_amount: minAmount,
      p_max_amount: num(body.max_amount),
      p_duration_value: num(body.duration_value),
      p_duration_unit: str(body.duration_unit),
      p_risk_level: str(body.risk_level),
      p_risk_disclosure: str(body.risk_disclosure),
      p_terms_text: str(body.terms_text),
      p_entry_fee_pct: num(body.entry_fee_pct) ?? 0,
      p_return_type: str(body.return_type) || 'none',
      p_return_rate_pct: num(body.return_rate_pct),
      p_kyc_required: body.kyc_required !== false,
      p_cancellation_allowed: body.cancellation_allowed === true,
      p_cancellation_terms: str(body.cancellation_terms),
    })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ version: data })
  }

  if (body.action === 'publish') {
    const { data, error } = await supabase.rpc('admin_publish_product_version', { p_version_id: str(body.version_id) })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ version: data })
  }

  if (body.action === 'status') {
    const { data, error } = await supabase.rpc('admin_set_investment_product_status', {
      p_product_id: str(body.product_id), p_status: str(body.status), p_reason: str(body.reason),
    })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ status: data })
  }

  if (body.action === 'review') {
    const { data, error } = await supabase.rpc('admin_review_investment', {
      p_investment_id: str(body.investment_id), p_action: str(body.decision), p_reason: str(body.reason),
    })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ investment: data })
  }

  if (body.action === 'complete') {
    const { data, error } = await supabase.rpc('admin_complete_investment', {
      p_investment_id: str(body.investment_id), p_reason: str(body.reason),
    })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ investment: data })
  }

  if (body.action === 'record_return') {
    const key = idempotencyKey(request, body as { idempotency_key?: unknown })
    if (!key) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_record_investment_return', {
      p_investment_id: str(body.investment_id), p_amount: num(body.amount), p_reason: str(body.reason), p_idempotency_key: key,
    })
    if (error) return dbError(friendly(error))
    return NextResponse.json({ profit_balance: data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Database constraint names mean nothing to an admin; say what to fix instead.
// The raw message is still logged for developers.
function friendly(error: { message?: string; code?: string }) {
  const m = error.message || ''
  if (error.code === '23505' && /code/.test(m)) return { ...error, code: 'P0001', message: 'That product code is already used' }
  if (error.code === '23514') {
    console.error('investments: constraint failed:', m)
    const hint =
      /code_check/.test(m) ? 'The product code may use lowercase letters, numbers and dashes only' :
      /name_check/.test(m) ? 'The name must be 2 to 120 characters' :
      /description_check/.test(m) ? 'The description must be at least 10 characters' :
      /risk_disclosure_check/.test(m) ? 'The risk disclosure must be at least 20 characters' :
      /terms_text_check/.test(m) ? 'The terms must be at least 20 characters' :
      /max_amount/.test(m) ? 'The maximum must be at least the minimum' :
      /min_amount/.test(m) ? 'The minimum must be greater than zero' :
      /term_days|duration/.test(m) ? 'Enter a duration (1 or more) with a unit, up to 10 years' :
      /entry_fee/.test(m) ? 'The fee must be between 0% and 99.99%' :
      /return/.test(m) ? 'A fixed rate needs both a rate and a duration; "no stated return" must not have a rate' :
      'Some of the values are not valid'
    return { ...error, code: 'P0001', message: hint }
  }
  return error
}

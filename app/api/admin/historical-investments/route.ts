import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

// Record Historical Investment (admin). Three actions, each a database
// function that checks admin rights again and validates every field:
//   check   – duplicate detection and linkable returns for the review screen
//   record  – adds the historical investment; never changes any balance
//   correct – an audited status change, return link, review sign-off or void
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['active', 'completed', 'matured', 'cancelled']
const CORRECTIONS = ['status', 'link_returns', 'resolve_review', 'void']
const bad = (error: string) => NextResponse.json({ error }, { status: 400 })
const text = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
const validDate = (v: unknown) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return bad('Invalid request.') }

  const tz = b.tz_offset_min === undefined ? 0 : Number(b.tz_offset_min)
  if (!Number.isInteger(tz) || tz < -840 || tz > 840) return bad('Invalid time zone.')
  const returns = Array.isArray(b.return_transaction_ids) ? b.return_transaction_ids : []
  if (returns.length > 50 || !returns.every(x => typeof x === 'string' && UUID.test(x))) return bad('Invalid return selection.')

  if (b.action === 'correct') {
    const recordId = typeof b.record_id === 'string' && UUID.test(b.record_id) ? b.record_id : ''
    if (!recordId) return bad('Choose a record.')
    if (typeof b.correction !== 'string' || !CORRECTIONS.includes(b.correction)) return bad('Choose a correction.')
    const reason = text(b.reason)
    if (reason.length < 5) return bad('Enter a reason for this correction (at least 5 characters).')
    const { data, error } = await supabase.rpc('admin_correct_historical_investment', {
      p_record_id: recordId,
      p_action: b.correction,
      p_reason: reason,
      p_status: typeof b.status === 'string' && STATUSES.includes(b.status) ? b.status : null,
      p_completed_date: validDate(b.completed_date),
      p_return_transaction_ids: returns,
      p_tz_offset_min: tz,
    })
    if (error) return dbError(error)
    return NextResponse.json({ result: data })
  }

  const userId = typeof b.user_id === 'string' && UUID.test(b.user_id) ? b.user_id : ''
  if (!userId) return bad('Choose a client.')
  const versionId = typeof b.product_version_id === 'string' && UUID.test(b.product_version_id) ? b.product_version_id : ''
  if (!versionId) return bad('Choose the investment product.')
  const amount = typeof b.amount === 'string' ? b.amount.trim() : ''
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return bad('Enter an amount greater than zero, with at most 2 decimal places.')
  const effective = validDate(b.effective_date)
  if (!effective) return bad('Choose the effective investment date.')
  const reference = text(b.original_reference).slice(0, 120) || null

  if (b.action === 'check') {
    const { data, error } = await supabase.rpc('admin_historical_investment_check', {
      p_user_id: userId, p_product_version_id: versionId, p_amount: amount, p_effective_date: effective, p_original_reference: reference,
    })
    if (error) return dbError(error)
    return NextResponse.json({ check: data })
  }

  if (b.action !== 'record') return bad('Unknown action.')
  if (typeof b.status !== 'string' || !STATUSES.includes(b.status)) return bad('Choose the investment\'s actual status.')
  const basis = text(b.status_basis)
  if (basis.length < 5) return bad('Explain how the status was established (at least 5 characters).')
  const reason = text(b.reason)
  if (reason.length < 10) return bad('Explain why this record is being added (at least 10 characters).')
  const evidencePath = typeof b.evidence_path === 'string' && b.evidence_path ? b.evidence_path : null
  if (evidencePath && !/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,100}\.(pdf|jpg|png|webp)$/.test(evidencePath)) return bad('Invalid evidence file.')
  const key = idempotencyKey(request, b as { idempotency_key?: unknown })
  if (!key) return bad('Missing request key. Refresh the page and try again.')

  const { data, error } = await supabase.rpc('admin_record_historical_investment', {
    p_user_id: userId,
    p_product_version_id: versionId,
    p_amount: amount,
    p_effective_date: effective,
    p_status: b.status,
    p_status_basis: basis,
    p_reason: reason,
    p_idempotency_key: key,
    p_completed_date: b.status === 'active' ? null : validDate(b.completed_date),
    p_original_reference: reference,
    p_evidence_reference: text(b.evidence_reference).slice(0, 500) || null,
    p_evidence_path: evidencePath,
    p_return_transaction_ids: returns,
    p_confirm_distinct: b.confirm_distinct === true,
    p_tz_offset_min: tz,
  })
  if (error) return dbError(error)
  return NextResponse.json({ record: data })
}

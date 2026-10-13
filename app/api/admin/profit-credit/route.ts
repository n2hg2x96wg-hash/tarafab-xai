import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'
import { isUuid, parseManualProfit } from '@/lib/manualProfitRequest'

// Manual Profit Credit (admin). The database function
// admin_manual_profit_credit_v2 checks admin rights again, validates every
// field (dates, historical and pre-opening rules, duplicate references), posts
// one ledger entry with its effective date, updates the profit balance, writes
// the admin record, the audit log and the client's notification in one
// database transaction, and returns the existing credit for a repeated
// request key.
const CLASSES = ['investment_return', 'profit_distribution', 'profit_allocation', 'debit_reversal'] as const

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const parsed = parseManualProfit(b)
  if ('error' in parsed) return parsed.error
  const f = parsed.fields
  const classification = typeof b.classification === 'string' && (CLASSES as readonly string[]).includes(b.classification) ? b.classification : ''
  if (!classification) return NextResponse.json({ error: 'Choose what this credit is.' }, { status: 400 })
  const investmentId = isUuid(b.investment_id) ? b.investment_id : null
  if (classification === 'investment_return' && !investmentId) return NextResponse.json({ error: 'Choose the investment this return belongs to.' }, { status: 400 })
  if (classification === 'debit_reversal' && !f.reverses) return NextResponse.json({ error: 'Choose the debit this corrects.' }, { status: 400 })
  const key = idempotencyKey(request, b as { idempotency_key?: unknown })
  if (!key) return NextResponse.json({ error: 'Missing request key. Refresh the page and try again.' }, { status: 400 })

  const { data, error } = await supabase.rpc('admin_manual_profit_credit_v2', {
    p_user_id: f.userId,
    p_amount: f.amount,
    p_effective_date: f.date,
    p_classification: classification,
    p_description: f.description,
    p_idempotency_key: key,
    p_investment_id: classification === 'investment_return' ? investmentId : null,
    p_backdate_reason: f.backdate,
    p_tz_offset_min: f.tz,
    p_external_reference: f.reference,
    p_evidence_path: f.evidence,
    p_internal_note: f.note,
    p_exception_ack: f.exceptionAck,
    p_exception_basis: f.exceptionBasis,
    p_reverses_reference: classification === 'debit_reversal' ? f.reverses : null,
  })
  if (error) return dbError(error)
  return NextResponse.json({ credit: data })
}

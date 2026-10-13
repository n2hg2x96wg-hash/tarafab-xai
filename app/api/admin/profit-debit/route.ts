import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'
import { parseManualProfit } from '@/lib/manualProfitRequest'

// Manual Profit Debit (admin). The database function admin_manual_profit_debit
// checks admin rights again, locks the client's account, refuses a debit
// larger than the available profit balance (after withdrawals already
// requested), validates the dates, references and any linked credit, posts one
// ledger entry, lowers the profit balance only, writes the admin record, the
// audit log and the client's notification in one database transaction, and
// returns the existing debit for a repeated request key.
const CATEGORIES = ['credit_reversal', 'balance_correction', 'payout', 'authorized_charge', 'other'] as const

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const parsed = parseManualProfit(b)
  if ('error' in parsed) return parsed.error
  const f = parsed.fields
  const category = typeof b.category === 'string' && (CATEGORIES as readonly string[]).includes(b.category) ? b.category : ''
  if (!category) return NextResponse.json({ error: 'Choose what this debit is.' }, { status: 400 })
  if (category === 'credit_reversal' && !f.reverses) return NextResponse.json({ error: 'Choose the credit this reverses.' }, { status: 400 })
  const key = idempotencyKey(request, b as { idempotency_key?: unknown })
  if (!key) return NextResponse.json({ error: 'Missing request key. Refresh the page and try again.' }, { status: 400 })

  const { data, error } = await supabase.rpc('admin_manual_profit_debit', {
    p_user_id: f.userId,
    p_amount: f.amount,
    p_effective_date: f.date,
    p_category: category,
    p_description: f.description,
    p_idempotency_key: key,
    p_backdate_reason: f.backdate,
    p_tz_offset_min: f.tz,
    p_external_reference: f.reference,
    p_evidence_path: f.evidence,
    p_internal_note: f.note,
    p_exception_ack: f.exceptionAck,
    p_exception_basis: f.exceptionBasis,
    p_reverses_reference: category === 'credit_reversal' ? f.reverses : null,
  })
  if (error) return dbError(error)
  return NextResponse.json({ debit: data })
}

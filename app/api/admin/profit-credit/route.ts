import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

// Manual Profit Credit (admin). The database function admin_manual_profit_credit
// checks admin rights again, validates every field, posts one ledger entry
// with its effective date, updates the profit balance, writes the admin record,
// the audit log and the client's notification in one database transaction,
// and returns the existing credit for a repeated request key.
const CLASSES = ['investment_return', 'profit_distribution', 'profit_allocation'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const userId = typeof b.user_id === 'string' && UUID.test(b.user_id) ? b.user_id : ''
  if (!userId) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 })
  const amount = typeof b.amount === 'string' ? b.amount.trim() : ''
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'Enter an amount greater than zero, with at most 2 decimal places.' }, { status: 400 })
  }
  const date = typeof b.effective_date === 'string' ? b.effective_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return NextResponse.json({ error: 'Choose an effective date.' }, { status: 400 })
  }
  const classification = typeof b.classification === 'string' && (CLASSES as readonly string[]).includes(b.classification) ? b.classification : ''
  if (!classification) return NextResponse.json({ error: 'Choose what this credit is.' }, { status: 400 })
  const investmentId = typeof b.investment_id === 'string' && UUID.test(b.investment_id) ? b.investment_id : null
  if (classification === 'investment_return' && !investmentId) return NextResponse.json({ error: 'Choose the investment this return belongs to.' }, { status: 400 })
  const reason = typeof b.reason === 'string' ? b.reason.replace(/\s+/g, ' ').trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'Enter a reason or reference (at least 5 characters).' }, { status: 400 })
  const backdate = typeof b.backdate_reason === 'string' ? b.backdate_reason.replace(/\s+/g, ' ').trim() : ''
  const tz = Number(b.tz_offset_min)
  if (!Number.isInteger(tz) || tz < -840 || tz > 840) return NextResponse.json({ error: 'Invalid time zone.' }, { status: 400 })
  const key = idempotencyKey(request, b as { idempotency_key?: unknown })
  if (!key) return NextResponse.json({ error: 'Missing request key. Refresh the page and try again.' }, { status: 400 })

  const { data, error } = await supabase.rpc('admin_manual_profit_credit', {
    p_user_id: userId,
    p_amount: amount,
    p_effective_date: date,
    p_classification: classification,
    p_reason: reason,
    p_idempotency_key: key,
    p_investment_id: classification === 'investment_return' ? investmentId : null,
    p_backdate_reason: backdate || null,
    p_tz_offset_min: tz,
  })
  if (error) return dbError(error)
  return NextResponse.json({ credit: data })
}

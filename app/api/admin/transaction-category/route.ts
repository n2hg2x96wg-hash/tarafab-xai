import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

const CATEGORIES = ['loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation', 'other']

// An admin states the documented reason of ONE existing profit-balance
// adjustment. The database function checks the caller is an admin and the row
// is a profit-balance adjustment, changes only its meaning (source), and
// audits the old and new value. Amount, dates, reference, status and balances
// are never touched.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  try {
    const body = await request.json() as { transaction_id?: string; category?: string; reason?: string }
    if (!body.transaction_id || !/^[0-9a-f-]{36}$/i.test(body.transaction_id)) return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    if (!body.category || !CATEGORIES.includes(body.category)) return NextResponse.json({ error: 'Choose a reason for this adjustment' }, { status: 400 })
    if ((body.reason || '').trim().length < 3) return NextResponse.json({ error: 'Enter why you are setting this reason.' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_set_profit_adjustment_category', {
      p_tx: body.transaction_id, p_category: body.category, p_reason: body.reason!.trim(),
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, ...(data as object) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

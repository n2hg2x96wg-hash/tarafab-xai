import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'
import { isUuid } from '@/lib/manualProfitRequest'

// Admin: a client's profit balance as the Manual Profit Credit / Debit forms
// need it — the balance, withdrawals already requested from it, what can be
// debited, the account opening date, and the manual entries that can still be
// reversed or corrected. admin_profit_balance_snapshot checks admin rights.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  const id = request.nextUrl.searchParams.get('client') || ''
  if (!isUuid(id)) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 })
  const { data, error } = await supabase.rpc('admin_profit_balance_snapshot', { p_user_id: id })
  if (error) return dbError(error)
  return NextResponse.json({ snapshot: data }, { headers: { 'Cache-Control': 'no-store' } })
}

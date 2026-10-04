import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

// Approves or rejects a pending deposit or withdrawal. The database function
// checks the caller is an admin and updates the balance in the same step.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  try {
    const { transaction_id, action, reason } = await request.json() as { transaction_id: string; action: 'approve' | 'reject'; reason?: string }
    if (!transaction_id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'transaction_id and action (approve/reject) required' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('admin_review_transaction', {
      p_tx_id: transaction_id,
      p_action: action,
      p_reason: reason?.trim() || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, status: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

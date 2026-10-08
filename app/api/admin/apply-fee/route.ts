import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

// An admin charges the client a fee. The database function checks the caller
// is an admin, debits the spendable balance once, records a real fee
// transaction (not an adjustment) and writes the audit log in one step.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  try {
    const body = await request.json() as {
      target_user_id: string
      amount: number
      reason: string
      idempotency_key?: string
      expected_updated_at?: string
      effective_at?: string
    }
    const { target_user_id, amount, reason, expected_updated_at } = body

    if (!target_user_id) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    if (typeof amount !== 'number' || !(amount > 0)) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }
    if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })

    let effectiveAt: string | null = null
    if (body.effective_at) {
      const ms = Date.parse(body.effective_at)
      if (Number.isNaN(ms)) return NextResponse.json({ error: 'Enter a valid effective date.' }, { status: 400 })
      effectiveAt = new Date(ms).toISOString()
    }

    const { data, error } = await supabase.rpc('admin_apply_fee', {
      p_user_id: target_user_id,
      p_amount: amount,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey(request, body),
      p_expected_updated_at: expected_updated_at || null,
      p_effective_at: effectiveAt,
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, field: 'available_balance', new_value: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

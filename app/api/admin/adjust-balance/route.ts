import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'

const VALID_FIELDS = ['account_balance', 'available_balance', 'invested_balance', 'pending_balance', 'profit_balance'] as const
const VALID_OPS = ['credit', 'debit', 'set'] as const
type Field = typeof VALID_FIELDS[number]
type Op = typeof VALID_OPS[number]

// The database function checks the caller is an admin, updates the balance,
// records an adjustment transaction and writes the audit log in one step.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const body = await request.json() as {
      target_user_id: string
      field: Field
      operation: Op
      amount: number
      reason: string
      idempotency_key?: string
      expected_updated_at?: string
      effective_at?: string
    }
    const { target_user_id, field, operation, amount, reason, expected_updated_at } = body

    if (!target_user_id || !VALID_FIELDS.includes(field) || !VALID_OPS.includes(operation)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount < 0 || (amount === 0 && operation !== 'set')) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
    }

    // Optional effective (business) date for the recorded transaction. The
    // database rejects future dates and dates before 2020 and audits it.
    let effectiveAt: string | null = null
    if (body.effective_at) {
      const ms = Date.parse(body.effective_at)
      if (Number.isNaN(ms)) return NextResponse.json({ error: 'Enter a valid effective date.' }, { status: 400 })
      effectiveAt = new Date(ms).toISOString()
    }

    const { data, error } = await supabase.rpc(effectiveAt ? 'admin_adjust_balance_effective' : 'admin_adjust_balance', {
      p_user_id: target_user_id,
      p_field: field,
      p_operation: operation,
      p_amount: amount,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey(request, body),
      p_expected_updated_at: expected_updated_at || null,
      ...(effectiveAt ? { p_effective_at: effectiveAt } : {}),
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, field, new_value: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

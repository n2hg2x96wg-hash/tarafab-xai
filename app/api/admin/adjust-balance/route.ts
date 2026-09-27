import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

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
    const { target_user_id, field, operation, amount, reason } = await request.json() as {
      target_user_id: string
      field: Field
      operation: Op
      amount: number
      reason: string
    }

    if (!target_user_id || !VALID_FIELDS.includes(field) || !VALID_OPS.includes(operation)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount < 0 || (amount === 0 && operation !== 'set')) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('admin_adjust_balance', {
      p_user_id: target_user_id,
      p_field: field,
      p_operation: operation,
      p_amount: amount,
      p_reason: reason.trim(),
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, field, new_value: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

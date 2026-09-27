import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_FIELDS = ['account_balance', 'available_balance', 'invested_balance', 'pending_balance'] as const
const VALID_OPS = ['credit', 'debit', 'set'] as const
type Field = typeof VALID_FIELDS[number]
type Op = typeof VALID_OPS[number]

export async function POST(request: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createClient(url, key)

    // Verify caller is admin
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: { role?: string } | null }
    if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const body = await request.json()
    const { target_user_id, field, operation, amount, reason } = body as {
      target_user_id: string
      field: Field
      operation: Op
      amount: number
      reason: string
    }

    if (!target_user_id || !VALID_FIELDS.includes(field) || !VALID_OPS.includes(operation)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
    }

    // Use admin-authenticated client (service key for writes)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const adminClient = serviceKey
      ? createClient(url, serviceKey)
      : createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })

    // Fetch current account
    const { data: acct, error: fetchErr } = await adminClient
      .from('accounts')
      .select('id, account_balance, available_balance, invested_balance, pending_balance')
      .eq('user_id', target_user_id)
      .single() as { data: Record<string, number> & { id: string } | null; error: unknown }

    if (fetchErr || !acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const current = acct[field] || 0
    let newValue: number
    if (operation === 'credit') newValue = current + amount
    else if (operation === 'debit') newValue = current - amount
    else newValue = amount

    if (newValue < 0) return NextResponse.json({ error: 'Resulting balance cannot be negative' }, { status: 400 })

    const { error: updateErr } = await adminClient
      .from('accounts')
      .update({ [field]: newValue, updated_at: new Date().toISOString() })
      .eq('user_id', target_user_id)

    if (updateErr) return NextResponse.json({ error: (updateErr as { message: string }).message }, { status: 500 })

    // Insert transaction record
    await adminClient.from('transactions').insert({
      user_id: target_user_id,
      type: 'adjustment',
      amount: amount,
      status: 'completed',
      notes: reason.trim(),
    })

    // Insert audit log
    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'admin_balance_adjustment',
      details: {
        admin_id: user.id,
        target_user_id,
        field,
        operation,
        amount,
        previous_value: current,
        new_value: newValue,
        reason: reason.trim(),
      },
    })

    return NextResponse.json({ success: true, field, previous: current, new_value: newValue })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

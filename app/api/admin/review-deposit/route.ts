import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

export async function POST(request: NextRequest) {
  const { url, anonKey, serviceKey } = getSupabaseEnv()
  if (!url || (!serviceKey && !anonKey)) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const authClient = createClient(url, anonKey || serviceKey)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { transaction_id, action, reason } = await request.json() as {
      transaction_id: string
      action: 'approve' | 'reject'
      reason?: string
    }

    if (!transaction_id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'transaction_id and action (approve/reject) required' }, { status: 400 })
    }

    const admin = serviceKey ? createClient(url, serviceKey) : createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })

    const { data: tx, error: txErr } = await admin
      .from('transactions')
      .select('id, user_id, amount, status, type')
      .eq('id', transaction_id)
      .single()

    if (txErr || !tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    if (!['pending_review', 'pending'].includes(tx.status)) {
      return NextResponse.json({ error: `Cannot review a transaction with status "${tx.status}"` }, { status: 400 })
    }

    if (action === 'approve') {
      const { error: updateErr } = await admin
        .from('transactions')
        .update({ status: 'completed', notes: reason ? `Approved: ${reason}` : 'Approved' })
        .eq('id', transaction_id)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      if (tx.type === 'deposit') {
        const { data: acc } = await admin.from('accounts').select('account_balance, available_balance').eq('user_id', tx.user_id).single()
        if (acc) {
          await admin.from('accounts').update({
            account_balance: (acc.account_balance || 0) + tx.amount,
            available_balance: (acc.available_balance || 0) + tx.amount,
          }).eq('user_id', tx.user_id)
        }
      }

      await admin.from('audit_logs').insert({
        user_id: user.id,
        action: 'deposit_approved',
        details: { transaction_id, amount: tx.amount, client_id: tx.user_id, reason },
      })

      return NextResponse.json({ success: true, status: 'completed' })
    } else {
      const { error: updateErr } = await admin
        .from('transactions')
        .update({ status: 'rejected', notes: reason ? `Rejected: ${reason}` : 'Rejected' })
        .eq('id', transaction_id)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      await admin.from('audit_logs').insert({
        user_id: user.id,
        action: 'deposit_rejected',
        details: { transaction_id, amount: tx.amount, client_id: tx.user_id, reason },
      })

      return NextResponse.json({ success: true, status: 'rejected' })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

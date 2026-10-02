import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

export async function GET(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const [{ data: profile, error: profileErr }, { data: account, error: accountErr }, { data: pendingTransactions, error: pendingErr }] = await Promise.all([
      supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
      supabase
        .from('accounts')
        .select('account_balance, available_balance, invested_balance, pending_balance, profit_balance, trading_status, trading_strategy_name, trading_status_updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('transactions')
        .select('id, type, amount')
        .eq('user_id', user.id)
        .in('status', ['pending_review', 'pending', 'requested', 'under_review', 'pending_verification', 'pending_blockchain_confirmation'])
        .in('type', ['deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'fee', 'investment']),
    ])
    // A failed read must not be shown as a zero balance.
    if (profileErr || accountErr || pendingErr) {
      return NextResponse.json({ error: 'Your account could not be loaded right now.' }, { status: 503 })
    }
    const pendingOperations = pendingTransactions || []
    // Pending is the gross amount of unresolved financial operations, not an
    // amount added to the credited account balance. Investment principal is
    // already held in accounts.pending_balance; count its ledger row but do not
    // add it twice. Other supported pending operation types are included once.
    const pendingAmountCents = pendingOperations.reduce((sum, tx) =>
      sum + (tx.type === 'investment' ? 0 : Math.round(Number(tx.amount) * 100)), 0)
    const savedAccount = account || {
      account_balance: 0,
      available_balance: 0,
      invested_balance: 0,
      pending_balance: 0,
      profit_balance: 0,
      trading_status: null,
      trading_strategy_name: null,
      trading_status_updated_at: null,
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        role: profile?.role || 'customer',
        email_confirmed: Boolean(user.email_confirmed_at),
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
      account: {
        ...savedAccount,
        pending_balance: Math.round((Number(savedAccount.pending_balance) * 100) + pendingAmountCents) / 100,
        pending_transaction_count: pendingOperations.length,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

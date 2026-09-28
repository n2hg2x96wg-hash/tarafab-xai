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

    const [{ data: profile, error: profileErr }, { data: account, error: accountErr }] = await Promise.all([
      supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
      supabase
        .from('accounts')
        .select('account_balance, available_balance, invested_balance, pending_balance, profit_balance, trading_status, trading_strategy_name, trading_status_updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    // A failed read must not be shown as a zero balance.
    if (profileErr || accountErr) {
      return NextResponse.json({ error: 'Your account could not be loaded right now.' }, { status: 503 })
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
      account: account || {
        account_balance: 0,
        available_balance: 0,
        invested_balance: 0,
        pending_balance: 0,
        profit_balance: 0,
        trading_status: null,
        trading_strategy_name: null,
        trading_status_updated_at: null,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

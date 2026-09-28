import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const { user_id, trading_status, trading_strategy_name, expected_updated_at } = await request.json() as {
      user_id: string; trading_status: string; trading_strategy_name?: string; expected_updated_at?: string
    }
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    if (!['active', 'inactive'].includes(trading_status)) {
      return NextResponse.json({ error: 'trading_status must be active or inactive' }, { status: 400 })
    }
    const { error } = await supabase.rpc('admin_set_trading_status', {
      p_user_id: user_id,
      p_trading_status: trading_status,
      p_trading_strategy_name: trading_strategy_name?.trim() || null,
      p_expected_updated_at: expected_updated_at || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

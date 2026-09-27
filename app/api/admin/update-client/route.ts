import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const { user_id, full_name, account_status, verification_status } = await request.json() as {
      user_id: string; full_name: string; account_status: string; verification_status: string
    }
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    const { error } = await supabase.rpc('admin_update_client', {
      p_user_id: user_id,
      p_full_name: String(full_name ?? '').trim(),
      p_account_status: account_status,
      p_verification_status: verification_status,
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

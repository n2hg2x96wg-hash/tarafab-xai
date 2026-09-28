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

    // Pages of 100, newest first. ?before=<created_at> returns the next older
    // page; one extra row tells the client whether more exist.
    const PAGE = 100
    const before = request.nextUrl.searchParams.get('before')
    let query = supabase
      .from('transactions')
      .select('id, type, method, amount, fee, status, reference, notes, address, direction, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1)
    if (before && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before)
    const { data: rows, error: txErr } = await query

    if (txErr) return NextResponse.json({ error: 'Transactions could not be loaded.' }, { status: 500 })

    const list = rows || []
    return NextResponse.json({ transactions: list.slice(0, PAGE), hasMore: list.length > PAGE })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

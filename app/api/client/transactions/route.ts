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

    // Pages of 100, newest first by effective (business) date. ?before=<date>
    // returns the next older page; one extra row tells whether more exist.
    // The client sees the effective date as the transaction date; the internal
    // recording timestamp is not returned.
    const PAGE = 100
    const before = request.nextUrl.searchParams.get('before')
    let query = supabase
      .from('transactions')
      .select('id, type, method, amount, fee, status, reference, address, direction, effective_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('effective_at', { ascending: false }).order('id', { ascending: false })
      .limit(PAGE + 1)
    if (before && !Number.isNaN(Date.parse(before))) query = query.lt('effective_at', before)
    const { data: rows, error: txErr } = await query

    if (txErr) return NextResponse.json({ error: 'Transactions could not be loaded.' }, { status: 500 })

    // created_at becomes the effective date. For a transaction whose date was
    // set by our team, updated_at is reported as the effective date too, so
    // no recording or correction time reaches the client.
    const list = (rows || []).map(({ effective_at, created_at, updated_at, ...t }) => ({
      ...t,
      created_at: effective_at,
      updated_at: effective_at === created_at ? updated_at : effective_at,
    }))
    return NextResponse.json({ transactions: list.slice(0, PAGE), hasMore: list.length > PAGE })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

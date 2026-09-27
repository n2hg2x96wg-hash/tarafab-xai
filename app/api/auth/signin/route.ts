import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()

  if (!url || !key) {
    return NextResponse.json({ error: `Missing env: url=${!!url} key=${!!key}` }, { status: 500 })
  }

  try {
    const body = await request.json()
    const email = String(body.email || '').replace(/[^\x20-\x7E]/g, '')
    const password = String(body.password || '')
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const supabase = createClient(url, key)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    let role = 'customer'
    if (data.session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single() as { data: { role?: string } | null }
      role = profile?.role || 'customer'
    }

    return NextResponse.json({
      role,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

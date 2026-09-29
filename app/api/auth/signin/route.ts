import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()

  if (!url || !key) {
    console.error('signin: Supabase env missing', { url: !!url, key: !!key })
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const email = String(body.email || '').replace(/[^\x20-\x7E]/g, '')
    const password = String(body.password || '')
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }
    const limited = rateLimited(`signin:${clientIp(request)}:${email.toLowerCase()}`, 10, 5 * 60_000)
    if (limited) return limited

    const supabase = createClient(url, key)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: error.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : error.message }, { status: error.status === 429 ? 429 : 401 })
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
    // Details stay in the server log; the client gets plain text.
    console.error('auth route failed:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  }
}

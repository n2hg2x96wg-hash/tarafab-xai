import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const limited = rateLimited(`signup:${clientIp(request)}`, 10, 10 * 60_000)
  if (limited) return limited

  try {
    const body = await request.json()
    const email = String(body.email || '').replace(/[^\x20-\x7E]/g, '')
    const password = String(body.password || '')
    const fullName = String(body.fullName || '').trim()
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const safePassword = password.replace(/[^\x20-\x7E]/g, '')
    if (safePassword !== password) {
      return NextResponse.json({ error: 'Password contains unsupported characters. Please use only standard characters.' }, { status: 400 })
    }

    const supabase = createClient(url, key)
    const { data, error } = await supabase.auth.signUp({
      email,
      password: safePassword,
      options: { data: { full_name: fullName || '' } },
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const needsVerification = data.user && !data.session
    return NextResponse.json({
      needsVerification,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

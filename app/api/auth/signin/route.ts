import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { recordSecurityEvent } from '@/lib/securityEvents'
import { limitAnon } from '@/lib/anonRateLimit'
import { SIGNIN_MAX_FAILS, attemptState, clearFailures, recordFailure, secondsLeft } from '@/lib/signinAttempts'

// Sign-in is paused after SIGNIN_MAX_FAILS wrong passwords in a row (see
// lib/signinAttempts). The page shows the attempts left and the countdown.
const paused = (lockedUntil: number) => {
  const retryAfter = secondsLeft(lockedUntil)
  const wait = Math.ceil(retryAfter / 60)
  return NextResponse.json(
    { error: `Too many attempts. Please wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`, code: 'RATE_LIMITED', retryAfter, attemptsLeft: 0 },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()

  if (!url || !key) {
    console.error('signin: Supabase env missing', { url: !!url, key: !!key })
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const email = String(body.email || '').replace(/[^\x20-\x7E]/g, '')
    const password = String(body.password || '')
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }
    const limited = rateLimited(`signin:${clientIp(request)}:${email.toLowerCase()}`, 10, 5 * 60_000)
    if (limited) return limited
    if (email.length > 254 || password.length > 128) return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 })
    // Shared across server instances: guesses against one account (from any
    // address) and attempts from one address (across accounts).
    {
      const shared = await limitAnon([
        { scope: 'signin_email', value: email, limit: 15, windowS: 900 },
        { scope: 'signin_ip', value: clientIp(request), limit: 40, windowS: 900 },
      ])
      if (shared) return shared
    }

    // While paused, the password is not even checked.
    const ip = clientIp(request)
    const before = await attemptState(email, ip)
    if (before?.lockedUntil) return paused(before.lockedUntil)

    const supabase = createClient(url, key, { global: { fetch: noStoreFetch } })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Recorded for admins (Security events); never shown to the client.
      if (error.status !== 429) await recordSecurityEvent('failed_login', null, clientIp(request), { email: email.toLowerCase().slice(0, 120) })
      // A stable code for the page; Supabase's own limit gives no timing.
      const code = error.status === 429 ? 'RATE_LIMITED'
        : error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message) ? 'EMAIL_NOT_CONFIRMED'
        : error.code === 'invalid_credentials' || /invalid login|credentials/i.test(error.message) ? 'INVALID_CREDENTIALS' : 'SIGNIN_FAILED'
      // Only a wrong email/password counts towards the pause (an unconfirmed
      // email means the password was right).
      if (code === 'INVALID_CREDENTIALS') {
        const after = await recordFailure(email, ip)
        if (after?.lockedUntil) return paused(after.lockedUntil)
        if (after) return NextResponse.json({ error: error.message, code, attemptsLeft: Math.max(0, SIGNIN_MAX_FAILS - after.fails) }, { status: 401 })
      }
      return NextResponse.json({ error: error.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : error.message, code }, { status: error.status === 429 ? 429 : 401 })
    }
    await clearFailures(email, ip)

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

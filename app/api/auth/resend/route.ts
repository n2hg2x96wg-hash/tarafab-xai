import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { limitAnon } from '@/lib/anonRateLimit'
import { authReturnBase } from '@/lib/site'

// Sends a new email-confirmation link for an account that has not confirmed
// its address yet (Supabase Auth's own resend; links, tokens and sessions are
// unchanged). Limited per address and per IP, here and by Supabase. The reply
// never says whether an account exists: a missing or already-confirmed
// account gets the same answer as a sent link.
export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()
  if (!url || !key) return NextResponse.json({ error: 'This is temporarily unavailable. Please try again later.' }, { status: 503 })
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email || '').replace(/[^\x20-\x7E]/g, '').trim()
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    const limited = rateLimited(`resend:${clientIp(request)}:${email.toLowerCase()}`, 3, 10 * 60_000)
    if (limited) return limited
    const shared = await limitAnon([
      { scope: 'resend_email', value: email, limit: 3, windowS: 3600 },
      { scope: 'resend_ip', value: clientIp(request), limit: 10, windowS: 3600 },
    ])
    if (shared) return shared
    const supabase = createClient(url, key, { global: { fetch: noStoreFetch }, auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await supabase.auth.resend({
      type: 'signup', email,
      // Same return address as the original confirmation email.
      options: { emailRedirectTo: `${authReturnBase(`http://${request.headers.get('host') || ''}`)}/sign-in` },
    })
    if (error) {
      if (error.status === 429) return NextResponse.json({ error: 'Too many requests. Please wait a few minutes and try again.', code: 'RATE_LIMITED' }, { status: 429 })
      // Unknown or already-confirmed addresses must look the same as a sent link.
      if (error.status === 400 || error.status === 422 || /not found|already|confirmed/i.test(error.message)) return NextResponse.json({ ok: true })
      console.error('resend failed:', error.status, error.code)
      return NextResponse.json({ error: 'We could not send a new link right now. Please try again later.', code: 'SEND_FAILED' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('resend route failed:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  }
}

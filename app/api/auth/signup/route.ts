import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { SIGNUP_CONSENT_VERSION } from '@/lib/consent'
import { authReturnBase } from '@/lib/site'
import { normalizePhone } from '@/lib/phone'
import { recordSecurityEvent } from '@/lib/securityEvents'
import { limitAnon } from '@/lib/anonRateLimit'

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
    // Bot checks: a hidden field that people never see was filled in, or the
    // form was sent faster than a person can complete it. Requests from older
    // pages without these fields are treated as before.
    const extra = typeof body.extra === 'string' ? body.extra.trim() : ''
    const formMs = typeof body.formMs === 'number' && Number.isFinite(body.formMs) ? body.formMs : null
    if (extra || (formMs !== null && formMs < 1200)) {
      await recordSecurityEvent('signup_bot_blocked', null, clientIp(request), { reason: extra ? 'hidden_field' : 'too_fast', form_ms: formMs })
      return NextResponse.json({ error: 'We could not complete your registration. Please try again.' }, { status: 400 })
    }
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    // Longer passwords are silently cut at 72 bytes by the password hash.
    if (password.length > 72) return NextResponse.json({ error: 'Password must be at most 72 characters' }, { status: 400 })
    // Shared across server instances: account creation per IP address.
    { const limited = await limitAnon([{ scope: 'signup_ip', value: clientIp(request), limit: 10, windowS: 3600 }]); if (limited) return limited }
    // Both statements must be explicitly accepted; nothing is inferred.
    if (body.consent?.age !== true || body.consent?.risk !== true) {
      return NextResponse.json({ error: 'Please confirm both statements to continue.' }, { status: 400 })
    }
    // Required contact number, checked here with the same rules as the form
    // and stored normalised (E.164) with its country. Profile data only: no
    // SMS is sent and it plays no part in signing in.
    const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '', typeof body.phoneCountry === 'string' ? body.phoneCountry.toUpperCase() : '')
    if (!phone.ok) {
      const error = phone.error === 'missing' ? 'Enter your phone number.' : phone.error === 'country' ? 'Choose your country calling code.' : 'Enter a valid phone number for the selected country.'
      return NextResponse.json({ error, field: 'phone', code: phone.error }, { status: 400 })
    }

    const safePassword = password.replace(/[^\x20-\x7E]/g, '')
    if (safePassword !== password) {
      return NextResponse.json({ error: 'Password contains unsupported characters. Please use only standard characters.' }, { status: 400 })
    }

    // Each acceptance is recorded separately with the server's time and the
    // wording version, alongside the name in the new user's sign-up metadata.
    const acceptedAt = new Date().toISOString()
    const consent = {
      age_confirmed_at: acceptedAt,
      risk_accepted_at: acceptedAt,
      version: SIGNUP_CONSENT_VERSION,
    }

    const supabase = createClient(url, key, { global: { fetch: noStoreFetch } })
    const { data, error } = await supabase.auth.signUp({
      email,
      password: safePassword,
      // The confirmation link returns to sign-in on the official domain.
      options: { data: { full_name: fullName || '', consent, phone_number: phone.e164, phone_country: phone.country }, emailRedirectTo: `${authReturnBase(`http://${request.headers.get('host') || ''}`)}/sign-in` },
    })

    if (error) return NextResponse.json({ error: error.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : error.message }, { status: error.status === 429 ? 429 : 400 })

    const needsVerification = data.user && !data.session
    return NextResponse.json({
      needsVerification,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    })
  } catch (e: unknown) {
    // Details stay in the server log; the client gets plain text.
    console.error('auth route failed:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  }
}

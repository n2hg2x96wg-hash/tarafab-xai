import { NextRequest, NextResponse } from 'next/server'
import { functionsUrl, getSupabaseEnv, isJwt } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { validateNewClient } from '@/lib/clientAccountValidation'

// Admin → Clients → Create Client Account.
//
// This route holds no privileged key. It checks the input, damps request
// storms, and forwards the admin's own access token to the
// admin-create-client Edge Function, which runs inside Supabase with the
// platform-provided service key, verifies the caller is an admin, creates the
// login through the Auth Admin API (email pre-confirmed) and writes the audit
// entry. The password is forwarded once and never logged or returned.
export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !isJwt(token)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const limited = rateLimited(`create-client:${clientIp(request)}`, 10, 10 * 60_000)
  if (limited) return limited

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const input = validateNewClient(body)
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })

  const { anonKey } = getSupabaseEnv()
  try {
    const res = await fetch(`${functionsUrl()}/admin-create-client`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: input.full_name, email: input.email, password: input.password }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    if (res.status === 401) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    if (!res.ok) {
      const error = typeof data.error === 'string' ? data.error
        : res.status === 403 ? 'You do not have permission to do that.'
        : 'The account could not be created. Please try again.'
      return NextResponse.json({ error }, { status: res.status })
    }
    return NextResponse.json({ user_id: data.user_id, email: data.email, full_name: data.full_name, role: data.role, email_confirmed: data.email_confirmed }, { status: 201 })
  } catch (e: unknown) {
    console.error('create-client: edge function unreachable:', e instanceof Error ? e.name : 'error')
    return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  }
}

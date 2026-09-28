import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv, isJwt } from './env'

// A Supabase client that acts as the signed-in caller, so database rules
// and auth.uid() apply to every query it makes.
export function clientForRequest(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  // Only a well-formed access token is passed on. Anything else would reach
  // Supabase and return a raw library error such as "Invalid Compact JWS".
  if (!token || !isJwt(token)) {
    if (token) console.error('auth: access token is not a compact JWS')
    return { token: '', supabase: null }
  }
  const { url, anonKey } = getSupabaseEnv()
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { token, supabase }
}

export const unauthorized = () => NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

export function dbError(err: { message?: string; code?: string } | null) {
  const msg = err?.message || 'Something went wrong'
  // Messages raised by our own database functions are written for clients and
  // pass through. A raw token/JWT error is a sign-in problem, not something
  // to show verbatim; the detail stays in the server log.
  if (/compact jws|jws|malformed jwt|invalid jwt/i.test(msg)) {
    console.error('db: token rejected:', msg)
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }
  const status =
    err?.code === 'PGRST301' || /jwt/i.test(msg) ? 401
    : /^admins only|^only admins/i.test(msg) ? 403
    : err?.code === '40001' ? 409 // changed by someone else since it was loaded
    : /^too many/i.test(msg) ? 429
    : 400
  return NextResponse.json({ error: status === 401 ? 'Please sign in again.' : msg }, { status })
}

// Client-generated key that makes a repeated submit return the original
// record instead of creating a second one. Invalid keys are ignored.
export function idempotencyKey(request: NextRequest, body?: { idempotency_key?: unknown }) {
  const raw = request.headers.get('idempotency-key') ?? body?.idempotency_key
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(raw) ? raw : null
}

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

export function dbError(err: { message?: string; code?: string; hint?: string } | null) {
  const msg = err?.message || 'Something went wrong'
  // A Free/Premium limit reached (raised by the database with this hint).
  if (err?.hint === 'premium_limit') return NextResponse.json({ error: msg, code: 'premium_limit' }, { status: 402 })
  // Messages raised by our own database functions are written for clients and
  // pass through. A raw token/JWT error is a sign-in problem, not something
  // to show verbatim; the detail stays in the server log.
  if (/compact jws|jws|malformed jwt|invalid jwt/i.test(msg)) {
    console.error('db: token rejected:', msg)
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }
  const code = err?.code || ''
  const status =
    code === 'PGRST301' || /jwt/i.test(msg) ? 401
    : /^admins only|^only admins|^not authorized/i.test(msg) || code === '42501' ? 403
    : code === '40001' ? 409 // changed by someone else since it was loaded
    : code === '23505' ? 409
    : /^too many/i.test(msg) ? 429
    : code === '57014' || code === '53300' || code === '08006' || /fetch failed|ECONNRESET|timeout/i.test(msg) ? 503
    : !code || code === 'P0001' || code === '23514' || code === '22023' || code === 'P0002' ? 400
    : 500
  if (status === 401) return NextResponse.json({ error: 'Please sign in again.' }, { status })
  // Only messages written by our own database functions (raise exception,
  // SQLSTATE P0001, or a mapped constraint) are shown. Anything else is an
  // internal detail: it is logged for developers and replaced with plain text.
  const ours = code === 'P0001' || code === '40001' || (code === '42501' && /^not authorized/i.test(msg)) || /^admins only|^only admins|^too many/i.test(msg)
    || (!code && status === 400 && !/relation|column|syntax|permission denied|violates|postgres|pgrst|schema|fetch|typeerror/i.test(msg))
  if (ours) return NextResponse.json({ error: msg }, { status })
  console.error('db error:', code, msg)
  const safe =
    status === 403 ? 'You do not have permission to do that.'
    : status === 409 ? 'This request was already submitted or changed. Refresh and try again.'
    : status === 503 ? 'Connection temporarily unavailable. Please try again.'
    : 'Something went wrong. Please try again.'
  return NextResponse.json({ error: safe }, { status })
}

// Client-generated key that makes a repeated submit return the original
// record instead of creating a second one. Invalid keys are ignored.
export function idempotencyKey(request: NextRequest, body?: { idempotency_key?: unknown }) {
  const raw = request.headers.get('idempotency-key') ?? body?.idempotency_key
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(raw) ? raw : null
}

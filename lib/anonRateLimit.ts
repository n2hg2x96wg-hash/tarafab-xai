import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Shared limit for requests made before sign-in (sign-in, sign-up), counted
// in the database (anon_rate_check) so every server instance counts
// together. The in-memory limiter in lib/rateLimit.ts stays as a cheap first
// line. The IP address or email is never stored: only a keyed SHA-256 digest
// (keyed with a server-only secret, so it cannot be reversed by guessing).
// Server only. A failed check is logged and does not block the request
// (Supabase Auth still applies its own limits).
type Check = { scope: string; value: string; limit: number; windowS: number }

export async function limitAnon(checks: Check[]): Promise<NextResponse | null> {
  const { url, serviceKey } = getSupabaseEnv()
  if (!url || !serviceKey) return null
  const db = createClient(url, serviceKey, { global: { fetch: noStoreFetch }, auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const results = await Promise.all(checks.map(c => db.rpc('anon_rate_check', {
      p_scope: c.scope,
      p_digest: createHmac('sha256', serviceKey).update(`${c.scope}:${c.value.toLowerCase()}`).digest('hex'),
      p_limit: c.limit,
      p_window_s: c.windowS,
    })))
    const blocked = results.findIndex(r => r.data === false)
    for (const r of results) if (r.error) console.error('anon rate check failed:', r.error.message)
    if (blocked >= 0) {
      // anon_rate_check counts in fixed windows aligned to the clock
      // (floor(now / window) * window), so the block lifts exactly when the
      // current window ends; +1s covers clock differences with the database.
      const w = checks[blocked].windowS
      const retryAfter = w - (Math.floor(Date.now() / 1000) % w) + 1
      const wait = Math.ceil(retryAfter / 60)
      return NextResponse.json(
        { error: `Too many attempts. Please wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`, code: 'RATE_LIMITED', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }
  } catch (e) { console.error('anon rate check failed:', e instanceof Error ? e.message : e) }
  return null
}

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Shared, per-user rate limit held in the database (client_rate_check), so
// every server instance counts together — unlike the in-memory limiter in
// lib/rateLimit.ts, which stays as a cheap first line. Exceeding a limit is
// recorded as a security event. A failed check never blocks the request on
// its own (the database still validates every financial operation).
export async function limitUser(supabase: SupabaseClient, scope: string, limit: number, windowS: number): Promise<NextResponse | null> {
  try {
    const { data, error } = await supabase.rpc('client_rate_check', { p_scope: scope, p_limit: limit, p_window_s: windowS })
    if (error) { console.error('rate check failed:', scope, error.message); return null }
    if (data === false) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429, headers: { 'Retry-After': String(Math.min(windowS, 600)) } })
    }
  } catch (e) { console.error('rate check failed:', scope, e instanceof Error ? e.message : e) }
  return null
}

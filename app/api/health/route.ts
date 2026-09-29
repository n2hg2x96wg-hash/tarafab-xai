import { NextResponse } from 'next/server'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Public, cheap platform probe used by the landing-page status strip. It asks
// the authentication service whether it is healthy and reports only a word,
// never internal detail. Cached briefly so many visitors cause one check.
export const revalidate = 30

export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  let platform: 'operational' | 'degraded' = 'degraded'
  if (url && anonKey) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(timer)
      if (res.ok) platform = 'operational'
    } catch { /* unreachable or slow: degraded */ }
  }
  return NextResponse.json({ platform }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } })
}

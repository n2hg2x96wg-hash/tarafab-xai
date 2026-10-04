import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Verified automation-engine status for the landing preview and the client
// Performance area: computed by the database from the engine's own heartbeat
// (automation_engine_status). Public, read-only, briefly CDN-cached so every
// visitor shares one read.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.rpc('automation_engine_status')
  if (error || !data) return NextResponse.json({ status: null }, { status: 503 })
  return NextResponse.json({ status: data }, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } })
}

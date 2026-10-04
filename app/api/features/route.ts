import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Public feature states (admin_only rows are not readable without the admin
// role). The UI uses this only to decide what to show; API routes enforce.
// Never cached: an admin change must reach every client on its next check.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.from('feature_flags').select('key, state')
  if (error) return NextResponse.json({ features: {} }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ features: Object.fromEntries((data || []).map(r => [r.key, r.state])) }, { headers: { 'Cache-Control': 'no-store' } })
}

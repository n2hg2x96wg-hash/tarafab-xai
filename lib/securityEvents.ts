import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Server-only: writes to the admin-only security_events table with the
// service key (never sent to the browser). Failure to record is logged and
// never affects the request being handled.
export async function recordSecurityEvent(kind: string, actor: string | null, ip: string | null, detail: Record<string, unknown> = {}) {
  try {
    const { url, serviceKey } = getSupabaseEnv()
    if (!url || !serviceKey) return
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await db.from('security_events').insert({ kind, actor, ip: ip ? ip.slice(0, 64) : null, detail })
    if (error) console.error('security event not recorded:', error.message)
  } catch (e) { console.error('security event not recorded:', e instanceof Error ? e.message : e) }
}

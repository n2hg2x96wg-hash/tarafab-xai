import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientIp } from '@/lib/rateLimit'
import { recordSecurityEvent } from '@/lib/securityEvents'

// Second, explicit server-side gate for /api/admin/*: the token must be valid
// and belong to an admin before the request body is even read. The database
// functions behind these routes check admin rights again (defence in depth).
// A refused attempt is recorded as a security event.
export async function requireAdmin(supabase: SupabaseClient, request: NextRequest): Promise<NextResponse | null> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error) return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  if (isAdmin !== true) {
    await recordSecurityEvent('admin_denied', auth.user.id, clientIp(request), { path: request.nextUrl.pathname })
    return NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 })
  }
  return null
}

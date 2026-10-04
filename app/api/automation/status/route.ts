import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, unauthorized } from '@/lib/supabase/request'

// Verified automation-engine status for signed-in clients (dashboard
// automation panel) and admins: computed by the database from the engine's
// own heartbeat (automation_engine_status). Not served to signed-out
// visitors; the public site only describes how automation works.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return unauthorized()
  const { data, error } = await supabase.rpc('automation_engine_status')
  if (error || !data) return NextResponse.json({ status: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ status: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'

// The caller's own nickname / display name. The legal name (profiles.full_name)
// cannot be changed here: set_my_display_name writes only display_name, and
// only on the caller's own profile (auth.uid()).
const NICKNAME_MAX = 40

export async function PATCH(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`profile:${clientIp(request)}`, 30, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (typeof b.display_name !== 'string') return NextResponse.json({ error: 'Enter a nickname.' }, { status: 400 })
  const name = b.display_name.replace(/\s+/g, ' ').trim()
  if (!name) return NextResponse.json({ error: 'Enter a nickname.' }, { status: 400 })
  if (name.length > NICKNAME_MAX) return NextResponse.json({ error: `Use ${NICKNAME_MAX} characters or fewer for your nickname.` }, { status: 400 })
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return NextResponse.json({ error: 'Your nickname contains characters we cannot accept.' }, { status: 400 })
  const { data, error } = await supabase.rpc('set_my_display_name', { p_display_name: name })
  if (error) return dbError(error)
  return NextResponse.json({ display_name: data ?? null })
}

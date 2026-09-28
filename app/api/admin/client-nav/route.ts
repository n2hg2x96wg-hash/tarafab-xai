import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Saves which optional client sections are hidden. The database function
// checks the caller is an admin, accepts only optional section ids, and
// writes an audit log entry; core account sections cannot be hidden.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  try {
    const { hidden } = await request.json() as { hidden?: unknown }
    if (!Array.isArray(hidden) || !hidden.every(h => typeof h === 'string') || hidden.length > 20) {
      return NextResponse.json({ error: 'hidden must be a list of section ids' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('admin_set_client_nav', { p_hidden: hidden })
    if (error) return dbError(error)
    return NextResponse.json({ config: data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

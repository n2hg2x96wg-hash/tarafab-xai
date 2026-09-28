import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Saves which optional client sections are hidden. The database function
// checks the caller is an admin, accepts only optional section ids, and
// writes an audit log entry; core account sections cannot be hidden.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  try {
    const { hidden, order, labels } = await request.json() as { hidden?: unknown; order?: unknown; labels?: unknown }
    const isIds = (v: unknown) => Array.isArray(v) && v.length <= 30 && v.every(h => typeof h === 'string')
    if (!isIds(hidden)) return NextResponse.json({ error: 'hidden must be a list of section ids' }, { status: 400 })
    if (order !== undefined && !isIds(order)) return NextResponse.json({ error: 'order must be a list of section ids' }, { status: 400 })
    if (labels !== undefined && (typeof labels !== 'object' || labels === null || Array.isArray(labels))) {
      return NextResponse.json({ error: 'labels must be an object' }, { status: 400 })
    }
    // Order and labels are optional; omitting them clears them (restore defaults).
    const { data, error } = await supabase.rpc('admin_set_client_nav_config', {
      p_hidden: hidden, p_order: (order as string[] | undefined) ?? [], p_labels: labels ?? {},
    })
    if (error) return dbError(error)
    return NextResponse.json({ config: data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

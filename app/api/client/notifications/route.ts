import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Notifications from the Tarafab.XAi team for the signed-in client. Row
// security returns only active ones addressed to this client or to everyone.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const [{ data: rows, error }, { data: reads, error: readErr }] = await Promise.all([
    supabase.from('client_notifications')
      .select('id, type, title, body, cta_label, cta_target, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('client_notification_reads').select('notification_id'),
  ])
  if (error || readErr) return dbError(error || readErr)
  const read = new Set((reads || []).map(r => r.notification_id))
  return NextResponse.json({ notifications: (rows || []).map(n => ({ ...n, read: read.has(n.id) })) })
}

// Mark notifications as read. The database only records ids this client can see.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  try {
    const { ids } = await request.json() as { ids?: unknown }
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every(i => typeof i === 'string' && /^[0-9a-f-]{36}$/i.test(i))) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { error } = await supabase.rpc('client_mark_notifications_read', { p_ids: ids })
    if (error) return dbError(error)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

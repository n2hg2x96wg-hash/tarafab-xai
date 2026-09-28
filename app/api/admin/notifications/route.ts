import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

const TYPES = ['account', 'deposit', 'withdrawal', 'security', 'announcement']

// Admin-only: every database function here checks is_admin() itself.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.rpc('admin_notifications')
  if (error) return dbError(error)
  return NextResponse.json({ notifications: data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  try {
    const body = await request.json() as {
      action?: string; id?: string; user_id?: string | null; type?: string; title?: string; body?: string; cta_label?: string; cta_target?: string
    }
    if (body.action === 'archive') {
      if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const { error } = await supabase.rpc('admin_archive_notification', { p_id: body.id })
      if (error) return dbError(error)
      return NextResponse.json({ ok: true })
    }
    const title = String(body.title || '').trim()
    if (!TYPES.includes(String(body.type))) return NextResponse.json({ error: 'Choose a notification type.' }, { status: 400 })
    if (!title || title.length > 120) return NextResponse.json({ error: 'Enter a title of up to 120 characters.' }, { status: 400 })
    if (String(body.body || '').length > 1000) return NextResponse.json({ error: 'The message can be up to 1000 characters.' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_send_notification', {
      p_user_id: body.user_id || null,
      p_type: body.type,
      p_title: title,
      p_body: String(body.body || ''),
      p_cta_label: body.cta_label?.trim() || null,
      p_cta_target: body.cta_target?.trim() || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ id: data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

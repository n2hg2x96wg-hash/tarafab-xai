import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'

const KINDS = ['price_above', 'price_below', 'pct_up', 'pct_down', 'move_abs']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The caller's own automations and their recent events. Statuses and
// triggers are set only by the server-side engine; this route cannot mark
// anything as triggered.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const [a, e] = await Promise.all([
    supabase.from('automations').select('id, asset_id, kind, target, notify, name, status, last_evaluated_at, last_price, last_change_pct, last_data_state, triggered_at, trigger_price, trigger_change_pct, last_error, created_at, updated_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('automation_events').select('id, automation_id, event, price, change_pct, created_at').order('created_at', { ascending: false }).limit(100),
  ])
  if (a.error) return dbError(a.error)
  return NextResponse.json({ automations: a.data || [], events: e.data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`automations:${clientIp(request)}`, 60, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const target = Number(b.target)
  const name = String(b.name ?? '').slice(0, 80)
  const id = String(b.id ?? '')
  switch (b.action) {
    case 'create': {
      if (!/^[A-Z0-9.]{1,12}$/.test(String(b.asset ?? '')) || !KINDS.includes(String(b.kind)) || !(target > 0)) return NextResponse.json({ error: 'Check the asset, condition and target.' }, { status: 400 })
      const { data, error } = await supabase.rpc('client_automation_create', { p_asset: b.asset, p_kind: b.kind, p_target: target, p_name: name, p_idempotency_key: idempotencyKey(request, b as { idempotency_key?: unknown }) })
      if (error) return dbError(error)
      return NextResponse.json({ automation: data })
    }
    case 'update': {
      if (!UUID.test(id) || !KINDS.includes(String(b.kind)) || !(target > 0)) return NextResponse.json({ error: 'Check the condition and target.' }, { status: 400 })
      const { data, error } = await supabase.rpc('client_automation_update', { p_id: id, p_kind: b.kind, p_target: target, p_name: name })
      if (error) return dbError(error)
      return NextResponse.json({ automation: data })
    }
    case 'pause': case 'resume': case 'delete': {
      if (!UUID.test(id)) return NextResponse.json({ error: 'Automation not found.' }, { status: 400 })
      const status = b.action === 'pause' ? 'paused' : b.action === 'resume' ? 'active' : 'deleted'
      const { data, error } = await supabase.rpc('client_automation_set_status', { p_id: id, p_status: status })
      if (error) return dbError(error)
      return NextResponse.json({ automation: data })
    }
    case 'duplicate': {
      if (!UUID.test(id)) return NextResponse.json({ error: 'Automation not found.' }, { status: 400 })
      const { data, error } = await supabase.rpc('client_automation_duplicate', { p_id: id })
      if (error) return dbError(error)
      return NextResponse.json({ automation: data })
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
}

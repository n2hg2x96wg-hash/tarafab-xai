import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

const STATUSES = ['paid_submitted', 'under_review', 'approved', 'rejected', 'issued', 'cancelled']

// Admin → Cards: settings, designs and applications. The database functions
// check admin rights again and write the audit log; no status change moves money.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  const status = request.nextUrl.searchParams.get('status')
  const [ov, apps] = await Promise.all([
    supabase.rpc('admin_card_overview'),
    supabase.rpc('admin_card_applications', { p_status: status && STATUSES.includes(status) ? status : null, p_limit: 200 }),
  ])
  if (ov.error) return dbError(ov.error)
  if (apps.error) return dbError(apps.error)
  return NextResponse.json({ ...(ov.data as object), applications: apps.data })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)

  if (b.action === 'settings') {
    const fee = b.fee === null || b.fee === '' || b.fee === undefined ? null : Number(b.fee)
    if (fee !== null && (!Number.isFinite(fee) || fee <= 0)) return NextResponse.json({ error: 'Enter a fee greater than zero.' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_card_set_settings', {
      p_fee: fee, p_open: b.open === true, p_terms: text(b.terms, 4000), p_issuer_name: text(b.issuer_name, 120), p_reason: text(b.reason, 500),
    })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  if (b.action === 'design') {
    const id = String(b.id ?? '')
    if (!/^[a-z0-9_-]{2,32}$/.test(id)) return NextResponse.json({ error: 'Invalid design.' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_card_set_design', { p_id: id, p_enabled: b.enabled === true })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  if (b.action === 'status') {
    const id = String(b.id ?? ''), status = String(b.status ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    const { data, error } = await supabase.rpc('admin_card_set_status', {
      p_id: id, p_status: status, p_note: text(b.note, 500), p_issuer_reference: text(b.issuer_reference, 80),
    })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
}

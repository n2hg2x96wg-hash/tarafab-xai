import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

const conditions = new Set(['price_above', 'price_below', 'change_above', 'change_below', 'volume_above'])

export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('market_automations').select('*, market_assets(symbol,name,icon)').order('created_at', { ascending: false })
  if (error) return dbError(error)
  return NextResponse.json({ automations: data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const asset_id = typeof body?.asset_id === 'string' ? body.asset_id : ''
  const condition = typeof body?.condition === 'string' ? body.condition : ''
  const threshold = Number(body?.threshold)
  if (!/^[0-9a-f-]{36}$/i.test(asset_id) || !conditions.has(condition) || !Number.isFinite(threshold) || threshold < 0) {
    return NextResponse.json({ error: 'Choose an asset, condition, and valid threshold.' }, { status: 400 })
  }
  const { data, error } = await supabase.from('market_automations').insert({ asset_id, condition, threshold }).select('*, market_assets(symbol,name,icon)').single()
  if (error) return dbError(error)
  return NextResponse.json({ automation: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const body = await request.json().catch(() => null) as { id?: string; status?: string; threshold?: number } | null
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'Invalid automation.' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (body.status && ['active', 'paused'].includes(body.status)) updates.status = body.status
  if (body.threshold !== undefined && Number.isFinite(body.threshold) && body.threshold >= 0) updates.threshold = body.threshold
  const { error } = await supabase.from('market_automations').update(updates).eq('id', body.id)
  if (error) return dbError(error)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid automation.' }, { status: 400 })
  const { error } = await supabase.from('market_automations').delete().eq('id', id)
  if (error) return dbError(error)
  return NextResponse.json({ ok: true })
}

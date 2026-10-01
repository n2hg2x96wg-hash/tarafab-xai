import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { quoteAsset, type Asset } from '@/lib/market-assets'

const conditions = new Set(['price_above', 'price_below', 'change_above', 'change_below', 'volume_above'])

async function signedIn(request: NextRequest) {
  const { token, supabase } = clientForRequest(request)
  if (!supabase || !token) return { supabase: null, user: null }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  return { supabase: error ? null : supabase, user: error ? null : user }
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await signedIn(request)
  if (!supabase || !user) return unauthorized()
  const { data, error } = await supabase.from('market_automations')
    .select('*, market_assets(symbol,name,icon), market_automation_events(id,status,observed_at,observed_value)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return dbError(error)
  return NextResponse.json({ automations: data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await signedIn(request)
  if (!supabase || !user) return unauthorized()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const asset_id = typeof body?.asset_id === 'string' ? body.asset_id : ''
  const condition = typeof body?.condition === 'string' ? body.condition : ''
  const thresholdInput = body?.threshold
  const threshold = typeof thresholdInput === 'string' && thresholdInput.trim()
    ? Number(thresholdInput)
    : typeof thresholdInput === 'number' ? thresholdInput : NaN
  const key = idempotencyKey(request, body ?? undefined)
  if (!/^[0-9a-f-]{36}$/i.test(asset_id) || !conditions.has(condition) || !Number.isFinite(threshold) || threshold < 0) {
    return NextResponse.json({ error: 'Choose an asset, condition, and valid threshold.' }, { status: 400 })
  }
  if (!key) return NextResponse.json({ error: 'This request could not be safely submitted. Please try again.' }, { status: 400 })

  const { data: existing, error: existingError } = await supabase.from('market_automations')
    .select('*, market_assets(symbol,name,icon)')
    .eq('user_id', user.id).eq('idempotency_key', key).maybeSingle()
  if (existingError) return dbError(existingError)
  if (existing) {
    const sameRequest = existing.asset_id === asset_id && existing.condition === condition && Number(existing.threshold) === threshold
    return sameRequest
      ? NextResponse.json({ automation: existing }, { status: 200 })
      : NextResponse.json({ error: 'This request key was already used. Please try again.' }, { status: 409 })
  }

  const { data: asset, error: assetError } = await supabase.from('market_assets')
    .select('id,symbol,name,category,description,icon,provider,provider_symbol,enabled,automation_enabled')
    .eq('id', asset_id).maybeSingle()
  if (assetError) return dbError(assetError)
  if (!asset || !asset.enabled) return NextResponse.json({ error: 'This asset is not available.' }, { status: 404 })
  if (asset.automation_enabled === false) {
    return NextResponse.json({ error: 'Automation is disabled for this asset.' }, { status: 409 })
  }

  const quote = await quoteAsset(asset as Asset)
  if (quote.price === null || quote.status === 'unavailable') {
    return NextResponse.json({ error: 'Automation requires usable market data. Try again when data is available.' }, { status: 409 })
  }
  if ((condition.startsWith('change_') && quote.change24h === null) || (condition === 'volume_above' && quote.volume24hUsd === null)) {
    return NextResponse.json({ error: 'This condition is not available for the selected asset.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('market_automations')
    .insert({ user_id: user.id, asset_id, condition, threshold, idempotency_key: key })
    .select('*, market_assets(symbol,name,icon)')
    .single()
  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await supabase.from('market_automations')
      .select('*, market_assets(symbol,name,icon)')
      .eq('user_id', user.id).eq('idempotency_key', key).maybeSingle()
    if (!lookupError && existing) {
      const sameRequest = existing.asset_id === asset_id && existing.condition === condition && Number(existing.threshold) === threshold
      if (sameRequest) return NextResponse.json({ automation: existing }, { status: 200 })
      return NextResponse.json({ error: 'This request key was already used. Please try again.' }, { status: 409 })
    }
  }
  if (error) return dbError(error)
  return NextResponse.json({ automation: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await signedIn(request)
  if (!supabase || !user) return unauthorized()
  const body = await request.json().catch(() => null) as { id?: string; status?: string; threshold?: number } | null
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'Invalid automation.' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (body.status && ['active', 'paused'].includes(body.status)) updates.status = body.status
  if (body.threshold !== undefined && Number.isFinite(body.threshold) && body.threshold >= 0) updates.threshold = body.threshold
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No valid changes were provided.' }, { status: 400 })
  const { data, error } = await supabase.from('market_automations').update(updates)
    .eq('id', body.id).eq('user_id', user.id).select('id').maybeSingle()
  if (error) return dbError(error)
  if (!data) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await signedIn(request)
  if (!supabase || !user) return unauthorized()
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid automation.' }, { status: 400 })
  const { data, error } = await supabase.from('market_automations').delete()
    .eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
  if (error) return dbError(error)
  if (!data) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

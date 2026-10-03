import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'

// The caller's own watchlist (row-level security returns only their rows).
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('client_watchlist').select('asset_id, position').order('position').limit(50)
  if (error) return dbError(error)
  return NextResponse.json({ assets: (data || []).map(r => r.asset_id) })
}

// { asset, on } adds/removes; { order: [...] } reorders. Only ever the caller's list.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  // Switched off in Admin → Feature controls: refused here too, not only hidden.
  { const blocked = await featureBlocked(supabase, 'watchlist'); if (blocked) return blocked }
  const limited = rateLimited(`watchlist:${clientIp(request)}`, 120, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (Array.isArray(b.order)) {
    const order = b.order.filter((x): x is string => typeof x === 'string' && /^[A-Z0-9.]{1,12}$/.test(x)).slice(0, 50)
    const { error } = await supabase.rpc('client_watchlist_reorder', { p_assets: order })
    if (error) return dbError(error)
    return NextResponse.json({ ok: true })
  }
  const asset = String(b.asset ?? '')
  if (!/^[A-Z0-9.]{1,12}$/.test(asset)) return NextResponse.json({ error: 'Invalid asset.' }, { status: 400 })
  const { data, error } = await supabase.rpc('client_watchlist_set', { p_asset: asset, p_on: b.on !== false })
  if (error) return dbError(error)
  return NextResponse.json(data)
}

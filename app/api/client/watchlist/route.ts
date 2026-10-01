import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.from('market_watchlists').select('asset_id, display_order, market_assets(*)').order('display_order')
  if (error) return dbError(error)
  return NextResponse.json({ watchlist: data || [] })
}

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const body = await request.json().catch(() => null) as { asset_id?: string; remove?: boolean } | null
  if (!body?.asset_id || !/^[0-9a-f-]{36}$/i.test(body.asset_id)) return NextResponse.json({ error: 'Invalid asset.' }, { status: 400 })
  const result = body.remove
    ? await supabase.from('market_watchlists').delete().eq('asset_id', body.asset_id)
    : await supabase.from('market_watchlists').upsert({ asset_id: body.asset_id }, { onConflict: 'user_id,asset_id' })
  if (result.error) return dbError(result.error)
  return NextResponse.json({ ok: true })
}

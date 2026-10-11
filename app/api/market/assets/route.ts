import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { usMarketOpen, type AssetQuote, type DataState } from '@/lib/assets'
import { effectiveState } from '@/lib/marketStatus'

// Every visible asset with the latest quote recorded by the server-side
// automation engine (one shared source of truth for prices, alerts and
// admin health). Nothing is estimated: missing data stays null with an
// honest state. CDN-cached briefly so all visitors share one database read.
// Freshness follows the same rule and threshold as the browser
// (lib/marketStatus), so the server never calls "live" what a page would
// call stale; browsers re-apply it with their own clock.
export const dynamic = 'force-dynamic'
// Never serve a cached database read for quotes (see lib/supabase/noStore).
export const fetchCache = 'force-no-store'
const SOURCE: Record<string, AssetQuote['source']> = { coinbase: 'Coinbase Exchange', coingecko: 'CoinGecko', finnhub: 'Finnhub' }

export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { global: { fetch: noStoreFetch }, auth: { persistSession: false, autoRefreshToken: false } })
  const [assets, quotes] = await Promise.all([
    sb.from('market_assets').select('id, name, category, note, chart_enabled, automation_enabled, sort_order, provider').order('sort_order').order('id'),
    sb.from('market_quotes').select('asset_id, price, change_pct, change_abs, high, low, prev_close, volume, source_time, fetched_at, state, error'),
  ])
  if (assets.error) return NextResponse.json({ error: 'Market data is unavailable right now.' }, { status: 503 })
  const q = new Map((quotes.data || []).map(r => [r.asset_id, r]))
  const now = Date.now()
  const open = usMarketOpen(new Date(now))
  const list: AssetQuote[] = (assets.data || []).map(a => {
    const r = q.get(a.id)
    let state: DataState = (r?.state as DataState) || 'unavailable'
    // The latest refresh failed but an earlier valid price is still recorded
    // (with its own provider time): show that price as stale, never as live
    // and never as if there were no price at all.
    if (state === 'error' && r?.price != null && (r?.source_time || null)) state = 'stale'
    const crypto = a.category === 'crypto'
    const market: AssetQuote['market'] = state === 'unavailable' || state === 'error' ? 'unavailable' : crypto ? '24/7' : open ? 'open' : 'closed'
    const updatedAt: string | null = r?.source_time || r?.fetched_at || null
    const checkedAt: string | null = r?.fetched_at || null
    const price = r?.price != null ? Number(r.price) : null
    if ((state === 'live' || state === 'delayed') && effectiveState({ price, state, updatedAt, market, checkedAt }, false, now) === 'stale') state = 'stale'
    return {
      id: a.id, name: a.name, category: a.category, note: a.note || '',
      chart: !!a.chart_enabled && crypto, automation: !!a.automation_enabled,
      price, changePct: r?.change_pct != null ? Number(r.change_pct) : null,
      changeAbs: r?.change_abs != null ? Number(r.change_abs) : null, high: r?.high != null ? Number(r.high) : null,
      low: r?.low != null ? Number(r.low) : null, prevClose: r?.prev_close != null ? Number(r.prev_close) : null,
      volume: r?.volume != null ? Number(r.volume) : null, updatedAt, checkedAt,
      state, market,
      source: SOURCE[String((a as { provider?: string }).provider || '')] ?? null,
      // Only a category of reason is exposed, never the raw error text.
      reason: r?.price != null && state !== 'unavailable' && state !== 'error' ? null
        : /not configured/i.test(String(r?.error || '')) ? 'not_connected' : 'temporary',
    }
  })
  return NextResponse.json({ assets: list, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { TIMEFRAMES, type Timeframe } from '@/lib/assets'

// Chart data for an asset and timeframe, from the same public sources the
// engine uses. Only crypto charts are available (Coinbase Exchange candles;
// CoinGecko for assets Coinbase does not list). Equity charts need a paid
// data plan and are reported as unavailable rather than invented.
const COINBASE = process.env.MARKET_COINBASE_BASE || 'https://api.exchange.coinbase.com'
const COINGECKO = process.env.MARKET_COINGECKO_BASE || 'https://api.coingecko.com/api/v3'
// timeframe → [granularity seconds, span seconds, cache seconds]
const CB: Record<Timeframe, [number, number, number]> = {
  '1H': [60, 3600, 30], '4H': [300, 4 * 3600, 60], '1D': [900, 86400, 120],
  '1W': [3600, 7 * 86400, 600], '1M': [21600, 30 * 86400, 1800], '1Y': [86400, 300 * 86400, 3600],
}
const CG_DAYS: Record<Timeframe, string> = { '1H': '1', '4H': '1', '1D': '1', '1W': '7', '1M': '30', '1Y': '365' }

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') || '').toUpperCase()
  const tf = (req.nextUrl.searchParams.get('tf') || '1D') as Timeframe
  if (!/^[A-Z0-9.]{1,12}$/.test(id) || !TIMEFRAMES.includes(tf)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: a } = await sb.from('market_assets').select('id, category, provider, provider_symbol, chart_enabled').eq('id', id).maybeSingle()
  if (!a) return NextResponse.json({ error: 'Unknown asset.' }, { status: 404 })
  if (!a.chart_enabled || a.category !== 'crypto') return NextResponse.json({ points: [], available: false, reason: 'Chart data is not available for this asset.' })
  // Premium-only timeframes (configured by an admin) are checked on the
  // server against the caller's entitlement, not just hidden in the page.
  const { data: st } = await sb.from('premium_settings').select('premium_timeframes').eq('id', 1).maybeSingle()
  if ((st?.premium_timeframes as string[] | undefined)?.includes(tf)) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    const user = token ? createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }) : null
    const { data: allowed } = user ? await user.rpc('client_can_use_timeframe', { p_tf: tf }) : { data: false }
    if (!allowed) return NextResponse.json({ points: [], available: false, premium: true, reason: 'This timeframe is available with Tarafab Premium.' }, { status: 402, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const [gran, span, ttl] = CB[tf]
  try {
    let points: [number, number][] = []
    if (a.provider === 'coinbase') {
      const end = Math.floor(Date.now() / 1000), start = end - span
      const r = await fetch(`${COINBASE}/products/${encodeURIComponent(a.provider_symbol)}/candles?granularity=${gran}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
        { headers: { 'User-Agent': 'tarafab-xai/1.0' }, signal: AbortSignal.timeout(8000), next: { revalidate: ttl } })
      if (!r.ok) throw new Error(String(r.status))
      const rows = await r.json() as number[][] // [time, low, high, open, close, volume]
      points = rows.filter(x => Array.isArray(x) && x.length >= 5).map(x => [x[0] * 1000, x[4]] as [number, number]).sort((p, q) => p[0] - q[0])
    } else if (a.provider === 'coingecko') {
      const r = await fetch(`${COINGECKO}/coins/${encodeURIComponent(a.provider_symbol)}/market_chart?vs_currency=usd&days=${CG_DAYS[tf]}`,
        { headers: { 'User-Agent': 'tarafab-xai/1.0' }, signal: AbortSignal.timeout(8000), next: { revalidate: ttl } })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { prices?: [number, number][] }
      const since = Date.now() - span * 1000
      points = (j.prices || []).filter(p => p[0] >= since)
    }
    if (!points.length) return NextResponse.json({ points: [], available: false, reason: 'No chart data was returned.' })
    return NextResponse.json({ points, available: true }, { headers: { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}` } })
  } catch {
    return NextResponse.json({ points: [], available: false, reason: 'Chart data is temporarily unavailable.' }, { status: 503 })
  }
}

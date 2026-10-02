// Automation engine (server-side, runs without any browser open).
//
// Called every minute by pg_cron (see migration 202610160002) with the run key
// stored in automation_engine_state. Each run:
//   1. refreshes real quotes for every enabled asset into market_quotes
//      (Coinbase Exchange / CoinGecko public data; Finnhub when the
//      FINNHUB_API_KEY secret is set) with an honest state:
//      live | delayed | stale | unavailable | error
//   2. evaluates active automations against those quotes, only when the data
//      is live or delayed (never on stale/unavailable data)
//   3. records a trigger through engine_trigger(), which moves the rule from
//      'active' to 'triggered' under a row lock — so a trigger is recorded and
//      notified exactly once even if runs overlap or repeat.
// Clients cannot call this function usefully: it requires the run key, and it
// only ever uses prices it fetched itself.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FINNHUB_KEY = (Deno.env.get('FINNHUB_API_KEY') || '').trim()
const COINBASE = Deno.env.get('MARKET_COINBASE_BASE') || 'https://api.exchange.coinbase.com'
const COINGECKO = Deno.env.get('MARKET_COINGECKO_BASE') || 'https://api.coingecko.com/api/v3'
const FINNHUB = Deno.env.get('MARKET_FINNHUB_BASE') || 'https://finnhub.io/api/v1'
const MIN_INTERVAL_S = 40

type Asset = { id: string; name: string; category: string; provider: string; provider_symbol: string; enabled: boolean; automation_enabled: boolean }
type Rule = { id: string; asset_id: string; kind: string; target: number }
type Quote = { price: number | null; change_pct: number | null; change_abs: number | null; high: number | null; low: number | null; prev_close: number | null; volume: number | null; source_time: string | null; state: 'live' | 'delayed' | 'stale' | 'unavailable' | 'error'; error: string | null }

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const n = (v: unknown) => { const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(x) ? x : null }
async function getJson(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': 'tarafab-xai/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`)
  return r.json()
}

// US equity regular session (Mon–Fri 09:30–16:00 America/New_York). Exchange
// holidays are not modelled; a holiday shows the last close as 'delayed'.
export function usMarketOpen(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
    .formatToParts(at).map(x => [x.type, x.value]))
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  const mins = (parseInt(p.hour) % 24) * 60 + parseInt(p.minute)
  return mins >= 570 && mins < 960
}

const empty = (state: Quote['state'], error: string): Quote => ({ price: null, change_pct: null, change_abs: null, high: null, low: null, prev_close: null, volume: null, source_time: null, state, error })

async function quoteFor(a: Asset): Promise<Quote> {
  try {
    if (a.provider === 'coinbase') {
      const s = await getJson(`${COINBASE}/products/${encodeURIComponent(a.provider_symbol)}/stats`)
      const last = n(s.last), open = n(s.open)
      if (last == null) return empty('unavailable', 'No price in provider response')
      return { price: last, change_abs: open ? last - open : null, change_pct: open ? ((last - open) / open) * 100 : null, high: n(s.high), low: n(s.low), prev_close: open, volume: n(s.volume), source_time: new Date().toISOString(), state: 'live', error: null }
    }
    if (a.provider === 'coingecko') {
      const id = a.provider_symbol
      const r = await getJson(`${COINGECKO}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`)
      const d = r?.[id]; const price = n(d?.usd)
      if (price == null) return empty('unavailable', 'No price in provider response')
      const pct = n(d.usd_24h_change); const t = n(d.last_updated_at)
      const ageMin = t ? (Date.now() - t * 1000) / 60000 : 999
      return { price, change_pct: pct, change_abs: pct != null ? price - price / (1 + pct / 100) : null, high: null, low: null, prev_close: null, volume: n(d.usd_24h_vol), source_time: t ? new Date(t * 1000).toISOString() : null, state: ageMin <= 15 ? 'live' : 'delayed', error: null }
    }
    if (a.provider === 'finnhub') {
      if (!FINNHUB_KEY) return empty('unavailable', 'Equity data source not configured (FINNHUB_API_KEY)')
      const q = await getJson(`${FINNHUB}/quote?symbol=${encodeURIComponent(a.provider_symbol)}&token=${encodeURIComponent(FINNHUB_KEY)}`)
      const c = n(q.c), t = n(q.t)
      if (!c || !t) return empty('unavailable', 'No quote for this symbol')
      const ageMin = (Date.now() - t * 1000) / 60000
      return { price: c, change_abs: n(q.d), change_pct: n(q.dp), high: n(q.h), low: n(q.l), prev_close: n(q.pc), volume: null, source_time: new Date(t * 1000).toISOString(), state: usMarketOpen() && ageMin <= 20 ? 'live' : 'delayed', error: null }
    }
    return empty('unavailable', 'Unknown provider')
  } catch (e) {
    return empty('error', e instanceof Error ? e.message.slice(0, 200) : 'Request failed')
  }
}

export function conditionMet(kind: string, target: number, price: number, pct: number | null) {
  switch (kind) {
    case 'price_above': return price >= target
    case 'price_below': return price <= target
    case 'pct_up': return pct != null && pct >= target
    case 'pct_down': return pct != null && pct <= -target
    case 'move_abs': return pct != null && Math.abs(pct) >= target
    default: return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: st } = await db.from('automation_engine_state').select('run_key, last_run_at').eq('id', 1).single()
  const key = req.headers.get('x-engine-key') || ''
  if (!st || key.length < 32 || key !== st.run_key) return json({ error: 'Forbidden' }, 403)

  // One run at a time / at most one per MIN_INTERVAL_S (atomic claim).
  const cutoff = new Date(Date.now() - MIN_INTERVAL_S * 1000).toISOString()
  const { data: claimed } = await db.from('automation_engine_state').update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', 1).or(`last_run_at.is.null,last_run_at.lt.${cutoff}`).select('id')
  if (!claimed?.length) return json({ skipped: 'ran recently' })

  let evaluated = 0, triggered = 0
  const errors: string[] = []
  try {
    const { data: assets, error: aErr } = await db.from('market_assets').select('id, name, category, provider, provider_symbol, enabled, automation_enabled')
    if (aErr) throw new Error('assets: ' + aErr.message)
    const { data: rules, error: rErr } = await db.from('automations').select('id, asset_id, kind, target').eq('status', 'active')
    if (rErr) throw new Error('automations: ' + rErr.message)
    const byAsset = new Map<string, Rule[]>()
    for (const r of (rules || []) as Rule[]) byAsset.set(r.asset_id, [...(byAsset.get(r.asset_id) || []), r])

    const enabled = ((assets || []) as Asset[]).filter(a => a.enabled)
    const quotes = await Promise.all(enabled.map(async a => [a, await quoteFor(a)] as const))
    for (const [a, q] of quotes) {
      await db.rpc('engine_record_quote', { p_asset: a.id, p_price: q.price, p_change_pct: q.change_pct, p_change_abs: q.change_abs, p_high: q.high, p_low: q.low,
        p_prev_close: q.prev_close, p_volume: q.volume, p_source_time: q.source_time, p_state: q.state, p_error: q.error })
      const list = byAsset.get(a.id) || []
      if (!list.length) continue
      const usable = q.price != null && (q.state === 'live' || q.state === 'delayed') && a.automation_enabled
      const pending: string[] = []
      for (const r of list) {
        evaluated++
        if (usable && conditionMet(r.kind, Number(r.target), q.price!, q.change_pct)) {
          const { data: ok, error } = await db.rpc('engine_trigger', { p_id: r.id, p_price: q.price, p_change_pct: q.change_pct })
          if (error) errors.push(`trigger ${r.id}: ${error.message}`); else if (ok) triggered++
        } else pending.push(r.id)
      }
      if (pending.length) {
        const why = !a.automation_enabled ? 'Automations are paused for this asset' : usable ? null : (q.error || `Market data ${q.state}`)
        await db.rpc('engine_mark_evaluated', { p_ids: pending, p_asset: a.id, p_price: q.price, p_change_pct: q.change_pct, p_state: q.state, p_error: why })
      }
    }
    // Rules on disabled assets are not evaluated; say why.
    for (const a of ((assets || []) as Asset[]).filter(x => !x.enabled)) {
      const ids = (byAsset.get(a.id) || []).map(r => r.id)
      if (ids.length) await db.rpc('engine_mark_evaluated', { p_ids: ids, p_asset: a.id, p_price: null, p_change_pct: null, p_state: 'unavailable', p_error: 'Asset is disabled' })
    }
    await db.from('automation_engine_state').update({ last_ok_at: new Date().toISOString(), last_error: errors.length ? errors.join('; ').slice(0, 500) : null,
      last_evaluated: evaluated, last_triggered: triggered, updated_at: new Date().toISOString() }).eq('id', 1)
    return json({ ok: true, assets: enabled.length, evaluated, triggered, errors: errors.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : 'Engine failure'
    await db.from('automation_engine_state').update({ last_error: msg, updated_at: new Date().toISOString() }).eq('id', 1)
    return json({ ok: false, error: msg }, 500)
  }
})

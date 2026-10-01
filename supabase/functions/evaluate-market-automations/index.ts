import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Asset = { symbol: string; provider: string | null; provider_symbol: string | null }
type Automation = {
  id: string
  condition: string
  threshold: number
  cooldown_minutes: number
  evaluation_interval_minutes: number
  last_evaluated_at: string | null
  last_triggered_at: string | null
  market_assets: Asset | null
}
type Quote = { price: number; change: number | null; volume: number | null; updatedAt: string }

const TIMEOUT_MS = 8_000
const CRYPTO_MAX_AGE_MS = 10 * 60_000
const STOOQ_MAX_AGE_MS = 7 * 24 * 60 * 60_000

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Market data request failed (${response.status})`)
  return response.json() as Promise<T>
}

function checkedQuote(price: number, change: number | null, volume: number | null, updatedAt: string, maxAge: number): Quote {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp > Date.now() + 60_000) {
    throw new Error('Market data unavailable')
  }
  if (Date.now() - timestamp > maxAge) throw new Error('Market data is too old to evaluate')
  return { price, change, volume, updatedAt }
}

async function quote(asset: Asset | null): Promise<Quote> {
  if (!asset?.provider || !asset.provider_symbol) throw new Error('Market data unavailable')
  if (asset.provider === 'coinbase') {
    const base = Deno.env.get('MARKET_COINBASE_BASE') || 'https://api.exchange.coinbase.com'
    const [ticker, statsResponse] = await Promise.all([
      fetchJson<Record<string, unknown>>(`${base}/products/${encodeURIComponent(asset.provider_symbol)}/ticker`),
      fetchJson<Record<string, unknown>>(`${base}/products/${encodeURIComponent(asset.provider_symbol)}/stats`).catch(() => null),
    ])
    const stats = statsResponse || {}
    const price = Number(ticker.price)
    const open = Number(stats.open)
    const volume = Number(stats.volume)
    const updatedAt = typeof ticker.time === 'string' ? ticker.time : ''
    return checkedQuote(
      price,
      Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null,
      Number.isFinite(volume) && volume >= 0 ? volume * price : null,
      updatedAt,
      CRYPTO_MAX_AGE_MS,
    )
  }
  if (asset.provider === 'coingecko') {
    const base = Deno.env.get('MARKET_COINGECKO_BASE') || 'https://api.coingecko.com/api/v3'
    const url = `${base}/simple/price?vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true&ids=${encodeURIComponent(asset.provider_symbol)}`
    const data = await fetchJson<Record<string, Record<string, unknown>>>(url)
    const row = data[asset.provider_symbol] || {}
    const timestamp = Number(row.last_updated_at)
    return checkedQuote(
      Number(row.usd),
      Number.isFinite(Number(row.usd_24h_change)) ? Number(row.usd_24h_change) : null,
      Number.isFinite(Number(row.usd_24h_vol)) ? Number(row.usd_24h_vol) : null,
      Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : '',
      CRYPTO_MAX_AGE_MS,
    )
  }
  if (asset.provider === 'stooq') {
    const base = Deno.env.get('MARKET_STOOQ_BASE') || 'https://stooq.com'
    const response = await fetch(`${base}/q/l/?s=${encodeURIComponent(asset.provider_symbol)}&f=sd2t2ohlcv&h&e=csv`, {
      headers: { Accept: 'text/csv' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Market data request failed (${response.status})`)
    const row = (await response.text()).trim().split(/\r?\n/)[1]?.split(',') || []
    if (row.length !== 8 || row[0]?.toLowerCase() !== asset.provider_symbol.toLowerCase() || row[6] === 'N/D' || row[3] === 'N/D') {
      throw new Error('Market data unavailable')
    }
    const open = Number(row[3])
    const price = Number(row[6])
    const updatedAt = new Date(`${row[1]}T${row[2] || '00:00:00'}Z`).toISOString()
    return checkedQuote(price, Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null, null, updatedAt, STOOQ_MAX_AGE_MS)
  }
  throw new Error('Market data unavailable')
}

function metric(condition: string, value: Quote) {
  if (condition.startsWith('price_')) return value.price
  if (condition.startsWith('change_')) return value.change
  if (condition === 'volume_above') return value.volume
  return null
}

function matches(condition: string, value: number, threshold: number) {
  if (condition === 'price_above' || condition === 'change_above' || condition === 'volume_above') return value > threshold
  if (condition === 'price_below' || condition === 'change_below') return value < threshold
  return false
}

Deno.serve(async () => {
  const { data: automations, error } = await supabase
    .from('market_automations')
    .select('id, condition, threshold, cooldown_minutes, evaluation_interval_minutes, last_evaluated_at, last_triggered_at, market_assets(symbol, provider, provider_symbol)')
    .eq('status', 'active')
    .limit(500)
  if (error) return Response.json({ error: 'Could not load automations.' }, { status: 500 })

  let evaluated = 0
  let triggered = 0
  for (const automation of (automations || []) as Automation[]) {
    const now = new Date()
    if (automation.last_evaluated_at && now.getTime() - Date.parse(automation.last_evaluated_at) < automation.evaluation_interval_minutes * 60_000) continue
    const lastTriggeredAge = automation.last_triggered_at ? now.getTime() - Date.parse(automation.last_triggered_at) : Infinity
    if (lastTriggeredAge < automation.cooldown_minutes * 60_000) continue
    try {
      const value = await quote(automation.market_assets)
      const observed = metric(automation.condition, value)
      if (observed === null || !Number.isFinite(observed)) throw new Error('Required market data is unavailable')

      evaluated++
      await supabase.from('market_automations')
        .update({ last_evaluated_at: now.toISOString(), last_error: null })
        .eq('id', automation.id).eq('status', 'active')

      if (matches(automation.condition, observed, Number(automation.threshold))) {
        const { data, error: triggerError } = await supabase.rpc('record_market_automation_trigger', {
          p_automation_id: automation.id,
          p_observed_value: observed,
          p_observed_at: now.toISOString(),
          p_event_key: `${automation.id}:trigger:${now.getTime()}`,
        })
        if (triggerError) throw triggerError
        if (data === true) triggered++
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Market data evaluation failed'
      await supabase.from('market_automations')
        .update({ last_evaluated_at: now.toISOString(), last_error: detail })
        .eq('id', automation.id).eq('status', 'active')
      await supabase.from('market_automation_events').insert({
        automation_id: automation.id,
        event_key: `${automation.id}:failure:${now.getTime()}`,
        status: 'failed',
        error: detail,
      })
    }
  }
  return Response.json({ evaluated, triggered })
})

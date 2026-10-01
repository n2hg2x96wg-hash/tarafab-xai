import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Automation = {
  id: string
  condition: string
  threshold: number
  cooldown_minutes: number
  evaluation_interval_minutes: number
  last_evaluated_at: string | null
  last_triggered_at: string | null
  market_assets: { symbol: string; provider: string | null; provider_symbol: string | null } | null
}

async function quote(asset: Automation['market_assets']) {
  if (!asset?.provider || !asset.provider_symbol) return null
  const url = asset.provider === 'coinbase'
    ? `https://api.exchange.coinbase.com/products/${asset.provider_symbol}/ticker`
    : `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&ids=${asset.provider_symbol}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`provider responded ${response.status}`)
  const data = await response.json()
  if (asset.provider === 'coinbase') return { price: Number(data.price), change: null, volume: Number(data.volume) }
  const row = data[asset.provider_symbol] || {}
  return { price: Number(row.usd), change: Number(row.usd_24h_change), volume: Number(row.usd_24h_vol) }
}

function matches(condition: string, value: { price: number; change: number | null; volume: number }, threshold: number) {
  if (condition === 'price_above') return value.price > threshold
  if (condition === 'price_below') return value.price < threshold
  if (condition === 'change_above') return value.change != null && value.change > threshold
  if (condition === 'change_below') return value.change != null && value.change < threshold
  if (condition === 'volume_above') return Number.isFinite(value.volume) && value.volume > threshold
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
    try {
      const value = await quote(automation.market_assets)
      if (!value || !Number.isFinite(value.price)) throw new Error('Market data unavailable')
      evaluated++
      await supabase.from('market_automations').update({ last_evaluated_at: now.toISOString(), last_error: null }).eq('id', automation.id)
      const cooldown = automation.last_triggered_at && now.getTime() - Date.parse(automation.last_triggered_at) < automation.cooldown_minutes * 60_000
      if (!cooldown && matches(automation.condition, value, Number(automation.threshold))) {
        const eventKey = `${automation.id}:${Math.floor(now.getTime() / (automation.cooldown_minutes * 60_000))}`
        const event = await supabase.from('market_automation_events').insert({
          automation_id: automation.id, observed_value: value.price, event_key: eventKey, status: 'triggered',
        })
        if (!event.error) {
          await supabase.from('market_automations').update({ status: 'triggered', last_triggered_at: now.toISOString() }).eq('id', automation.id)
          triggered++
        }
      }
    } catch (err) {
      await supabase.from('market_automations').update({ last_evaluated_at: now.toISOString(), status: 'error', last_error: err instanceof Error ? err.message : 'Evaluation failed' }).eq('id', automation.id)
      await supabase.from('market_automation_events').insert({ automation_id: automation.id, event_key: `${automation.id}:failure:${now.getTime()}`, status: 'failed', error: err instanceof Error ? err.message : 'Evaluation failed' })
    }
  }
  return Response.json({ evaluated, triggered })
})

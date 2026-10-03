// USD/NGN reference rate for display only (NGN stays the billing amount).
// Sources, in order: Coinbase's public exchange-rates API, then
// open.er-api.com. A rate is used only when it parses, lies in a sane range,
// and (when both answer) the two agree within 5%. Cached for 10 minutes.
const SOURCES: { name: string; url: string; pick: (j: any) => unknown }[] = [
  { name: 'coinbase', url: (process.env.FX_COINBASE_URL || 'https://api.coinbase.com/v2/exchange-rates?currency=USD'), pick: j => j?.data?.rates?.NGN },
  { name: 'open.er-api.com', url: (process.env.FX_ERAPI_URL || 'https://open.er-api.com/v6/latest/USD'), pick: j => j?.rates?.NGN },
]
export type FxRate = { rate: number; source: string; as_of: string; stale?: boolean } | null
let cache: { at: number; value: FxRate } | null = null
// Last verified rate, served (marked stale) when the sources are briefly down.
let lastGood: { at: number; value: NonNullable<FxRate> } | null = null
const STALE_MAX = 7 * 24 * 3600_000
const TTL = 10 * 60_000

async function fetchOne(s: (typeof SOURCES)[number]) {
  try {
    const r = await fetch(s.url, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
    if (!r.ok) return null
    const n = Number(s.pick(await r.json()))
    return Number.isFinite(n) && n >= 100 && n <= 100_000 ? n : null
  } catch { return null }
}

export async function usdNgnRate(): Promise<FxRate> {
  if (cache && Date.now() - cache.at < TTL) return cache.value
  const [a, b] = await Promise.all(SOURCES.map(fetchOne))
  let value: FxRate = null
  if (a && b) value = Math.abs(a - b) / Math.max(a, b) <= 0.05 ? { rate: a, source: SOURCES[0].name, as_of: new Date().toISOString() } : null
  else if (a || b) value = { rate: (a || b)!, source: a ? SOURCES[0].name : SOURCES[1].name, as_of: new Date().toISOString() }
  if (value) lastGood = { at: Date.now(), value }
  else if (lastGood && Date.now() - lastGood.at < STALE_MAX) value = { ...lastGood.value, stale: true }
  // Keep a failed lookup only briefly so a recovered source is used soon.
  cache = { at: value && !value.stale ? Date.now() : Date.now() - TTL + 60_000, value }
  return value
}

// Test hook: clears the in-memory cache.
export const __resetFxCache = (all = false) => { cache = null; if (all) lastGood = null }

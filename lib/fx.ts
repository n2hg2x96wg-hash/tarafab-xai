// Exchange rates for price DISPLAY only (NGN stays the billing amount).
// Sources: Coinbase's public exchange-rates API, then open.er-api.com, both
// USD-based. A currency's rate is used only when it parses, lies in a sane
// range, and (when both sources answer) the two agree within 5%. Cached for
// 10 minutes; if both sources fail, the last verified rates are served for up
// to 7 days, marked stale.
import { CURRENCIES } from '@/lib/currency'

type Src = { name: string; url: string; pick: (j: any) => Record<string, unknown> | undefined }
const SOURCES: Src[] = [
  { name: 'coinbase', url: (process.env.FX_COINBASE_URL || 'https://api.coinbase.com/v2/exchange-rates?currency=USD'), pick: j => j?.data?.rates },
  { name: 'open.er-api.com', url: (process.env.FX_ERAPI_URL || 'https://open.er-api.com/v6/latest/USD'), pick: j => j?.rates },
]
export type FxRates = { base: 'USD'; rates: Record<string, number>; source: string; as_of: string; stale?: boolean } | null
let cache: { at: number; value: FxRates } | null = null
let lastGood: { at: number; value: NonNullable<FxRates> } | null = null
const TTL = 10 * 60_000, STALE_MAX = 7 * 24 * 3600_000

async function fetchOne(s: Src): Promise<Record<string, number> | null> {
  try {
    const r = await fetch(s.url, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
    if (!r.ok) return null
    const raw = s.pick(await r.json()) || {}
    const out: Record<string, number> = {}
    for (const c of Object.keys(CURRENCIES)) {
      const n = c === 'USD' ? 1 : Number(raw[c])
      if (Number.isFinite(n) && n > 0 && n < 1_000_000) out[c] = n
    }
    // NGN anchors every conversion: without a sane NGN rate the source is unusable.
    return out.NGN >= 100 && out.NGN <= 100_000 ? out : null
  } catch { return null }
}

export async function fxRates(): Promise<FxRates> {
  if (cache && Date.now() - cache.at < TTL) return cache.value
  const [a, b] = await Promise.all(SOURCES.map(fetchOne))
  let value: FxRates = null
  const agree = (x: number, y: number) => Math.abs(x - y) / Math.max(x, y) <= 0.05
  if (a && b) {
    if (agree(a.NGN, b.NGN)) {
      const rates: Record<string, number> = {}
      for (const c of Object.keys(CURRENCIES)) {
        if (a[c] && b[c]) { if (agree(a[c], b[c])) rates[c] = a[c] } else if (a[c] || b[c]) rates[c] = (a[c] || b[c])!
      }
      value = { base: 'USD', rates, source: `${SOURCES[0].name} (checked against ${SOURCES[1].name})`, as_of: new Date().toISOString() }
    }
  } else if (a || b) value = { base: 'USD', rates: (a || b)!, source: a ? SOURCES[0].name : SOURCES[1].name, as_of: new Date().toISOString() }
  if (value) lastGood = { at: Date.now(), value }
  else if (lastGood && Date.now() - lastGood.at < STALE_MAX) value = { ...lastGood.value, stale: true }
  cache = { at: value && !value.stale ? Date.now() : Date.now() - TTL + 60_000, value }
  return value
}
// Compatibility: NGN per USD.
export async function usdNgnRate() {
  const fx = await fxRates()
  return fx?.rates.NGN ? { rate: fx.rates.NGN, source: fx.source, as_of: fx.as_of, stale: fx.stale } : null
}
// Test hook: clears the in-memory cache.
export const __resetFxCache = (all = false) => { cache = null; if (all) lastGood = null }

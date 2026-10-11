// One market-status model for every surface (hero, ticker, market board,
// landing story, dashboard, and the server's /api/market/assets). A label is
// derived from the quote's own provider timestamp and from whether the latest
// refresh succeeded — never from hope. Nothing here produces or estimates a
// price or a time.
//
//   live         fresh provider time (within the threshold), last refresh OK,
//                and the provider itself reported the quote as live
//   delayed      fresh, but the provider marks it delayed, or a closed
//                market's last close that was re-checked within the threshold
//   stale        older than the threshold, no usable timestamp, a timestamp
//                in the future, or shown after a failed refresh
//   unavailable  no price, or the provider reported none
import type { AssetQuote } from '@/lib/assets'

export type MarketState = 'live' | 'delayed' | 'stale' | 'unavailable'

// Freshness threshold, configurable per deployment with
// NEXT_PUBLIC_MARKET_STALE_AFTER_SEC (seconds, 60–900; default 180). The
// automation engine records quotes every minute and the API is CDN-cached for
// up to ~45 s, so a healthy feed stays well inside the default. NEXT_PUBLIC_
// makes the browser and the server use the same value.
export const DEFAULT_STALE_AFTER_SEC = 180
export function staleAfterMs(raw: string | undefined = process.env.NEXT_PUBLIC_MARKET_STALE_AFTER_SEC) {
  const n = raw == null || raw.trim() === '' ? NaN : Number(raw)
  return (Number.isFinite(n) && n >= 60 && n <= 900 ? Math.round(n) : DEFAULT_STALE_AFTER_SEC) * 1000
}
export const STALE_AFTER_MS = staleAfterMs()

// Provider clocks may run slightly ahead of ours; anything further ahead than
// this is treated as an invalid timestamp rather than as "brand new".
const FUTURE_TOLERANCE_MS = 60_000

const parse = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

// Age of a quote from its provider timestamp, or null when it has no usable
// timestamp (missing, unparsable, or implausibly in the future).
export function quoteAgeMs(updatedAt: string | null | undefined, now = Date.now()): number | null {
  const at = parse(updatedAt)
  if (!Number.isFinite(at) || at - now > FUTURE_TOLERANCE_MS) return null
  return Math.max(0, now - at)
}

type QuoteLike = Pick<AssetQuote, 'price' | 'state' | 'updatedAt'> & Partial<Pick<AssetQuote, 'market' | 'checkedAt'>>

export function effectiveState(a: QuoteLike, refreshFailed: boolean, now = Date.now(), staleAfter = STALE_AFTER_MS): MarketState {
  if (a.price == null || !Number.isFinite(a.price) || a.state === 'unavailable' || a.state === 'error') return 'unavailable'
  if (a.state === 'stale' || refreshFailed) return 'stale'
  // A closed market's last close is expectedly old: it is "delayed" as long
  // as the server re-checked it recently, never "live".
  if (a.market === 'closed') {
    const checked = quoteAgeMs(a.checkedAt, now)
    return checked != null && checked <= staleAfter ? 'delayed' : 'stale'
  }
  const age = quoteAgeMs(a.updatedAt, now)
  if (age == null || age > staleAfter) return 'stale'
  return a.state === 'live' ? 'live' : 'delayed'
}

// Overall feed status for a set of quotes: 'live' only if at least one quote
// is genuinely live; 'error' only when nothing usable is available at all.
// Delayed/stale quotes report 'connecting' (shown as "Refreshing"), never live.
export function feedStatus(assets: AssetQuote[] | null, refreshFailed: boolean, now = Date.now()): 'connecting' | 'live' | 'error' {
  if (!assets) return refreshFailed ? 'error' : 'connecting'
  const states = assets.map(a => effectiveState(a, refreshFailed, now))
  if (states.includes('live')) return 'live'
  if (states.some(s => s === 'delayed' || s === 'stale')) return 'connecting'
  return 'error'
}

// Compact age for labels ("<1m", "4m", "3h", "2d"); '' without a usable time.
export function ageLabel(updatedAt: string | null | undefined, now = Date.now()) {
  const ms = quoteAgeMs(updatedAt, now)
  if (ms == null) return ''
  const m = Math.round(ms / 60_000)
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}

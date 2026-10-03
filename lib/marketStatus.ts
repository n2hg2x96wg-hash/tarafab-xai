// One market-status model for every client surface (ticker, market board,
// landing story, dashboard trust bar). A label is derived from the quote's own
// provider timestamp and from whether the latest refresh succeeded — never
// from hope. Nothing here produces or estimates a price.
import type { AssetQuote } from '@/lib/assets'

export type MarketState = 'live' | 'delayed' | 'stale' | 'unavailable'

// A quote older than this is stale whatever the server last called it.
export const STALE_AFTER_MS = 3 * 60_000

export function effectiveState(a: Pick<AssetQuote, 'price' | 'state' | 'updatedAt'>, refreshFailed: boolean, now = Date.now()): MarketState {
  if (a.price == null || !Number.isFinite(a.price) || a.state === 'unavailable' || a.state === 'error') return 'unavailable'
  const at = a.updatedAt ? Date.parse(a.updatedAt) : NaN
  if (Number.isFinite(at) && now - at > STALE_AFTER_MS) return 'stale'
  if (a.state === 'stale') return 'stale'
  // The last refresh failed: what is on screen is no longer known to be current.
  if (refreshFailed) return 'stale'
  return a.state === 'live' ? 'live' : 'delayed'
}

// Overall feed status for a set of quotes: 'live' only if at least one quote
// is genuinely live; 'error' only when nothing usable is available at all.
// Delayed/stale quotes report 'connecting' (shown as "Refreshing"), never live.
export function feedStatus(assets: AssetQuote[] | null, refreshFailed: boolean): 'connecting' | 'live' | 'error' {
  if (!assets) return refreshFailed ? 'error' : 'connecting'
  const states = assets.map(a => effectiveState(a, refreshFailed))
  if (states.includes('live')) return 'live'
  if (states.some(s => s === 'delayed' || s === 'stale')) return 'connecting'
  return 'error'
}

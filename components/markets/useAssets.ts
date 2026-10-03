'use client'

import { authFetch } from '@/lib/authFetch'
import type { AssetQuote, Timeframe } from '@/lib/assets'

export { useAssets, type Snap } from './assetStore'

// Chart points for one asset/timeframe, cached per page session.
const chartCache = new Map<string, { at: number; v: { points: [number, number][]; available: boolean; reason?: string } }>()
export async function loadChart(id: string, tf: Timeframe, signal?: AbortSignal) {
  const k = `${id}:${tf}`
  const c = chartCache.get(k)
  if (c && Date.now() - c.at < 60_000) return c.v
  // Sent with the session when there is one, so Premium timeframes can be
  // checked on the server.
  const r = await authFetch(`/api/market/candles?id=${encodeURIComponent(id)}&tf=${tf}`, { signal })
  const v = await r.json().catch(() => ({ points: [], available: false })) as { points: [number, number][]; available: boolean; reason?: string; premium?: boolean }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (r.ok) chartCache.set(k, { at: Date.now(), v })
  return v
}

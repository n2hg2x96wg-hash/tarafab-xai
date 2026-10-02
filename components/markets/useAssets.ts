'use client'

import { useEffect, useState } from 'react'
import type { AssetQuote, Timeframe } from '@/lib/assets'

// One shared fetch of /api/market/assets for every component on the page,
// refreshed every 30 s while the page is visible (paused in background tabs).
type Snap = { assets: AssetQuote[] | null; error: boolean; at: number }
let snap: Snap = { assets: null, error: false, at: 0 }
const subs = new Set<(s: Snap) => void>()
let timer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<void> | null = null

async function load() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/market/assets', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { assets: AssetQuote[] }
      snap = { assets: j.assets, error: false, at: Date.now() }
    } catch { snap = { ...snap, error: true, at: Date.now() } }
    subs.forEach(f => f(snap))
  })().finally(() => { inflight = null })
  return inflight
}
const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - snap.at > 25_000) load() }

export function useAssets() {
  const [s, setS] = useState<Snap>(snap)
  useEffect(() => {
    subs.add(setS)
    if (!snap.assets || Date.now() - snap.at > 25_000) load()
    if (!timer) {
      timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30_000)
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      subs.delete(setS)
      if (!subs.size && timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible) }
    }
  }, [])
  return { ...s, reload: load }
}

// Chart points for one asset/timeframe, cached per page session.
const chartCache = new Map<string, { at: number; v: { points: [number, number][]; available: boolean; reason?: string } }>()
export async function loadChart(id: string, tf: Timeframe, signal?: AbortSignal) {
  const k = `${id}:${tf}`
  const c = chartCache.get(k)
  if (c && Date.now() - c.at < 60_000) return c.v
  const r = await fetch(`/api/market/candles?id=${encodeURIComponent(id)}&tf=${tf}`, { signal })
  const v = await r.json().catch(() => ({ points: [], available: false })) as { points: [number, number][]; available: boolean; reason?: string }
  if (r.ok) chartCache.set(k, { at: Date.now(), v })
  return v
}

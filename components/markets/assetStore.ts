'use client'

import { useEffect, useState } from 'react'
import type { AssetQuote } from '@/lib/assets'

// Shared market snapshot (no authentication, no Supabase): one fetch of
// /api/market/assets for every component on the page, refreshed every 30 s
// while the page is visible (paused in background tabs). Kept free of heavy
// imports so the landing page can use it in its first load.
export type Snap = { assets: AssetQuote[] | null; error: boolean; at: number }
let snap: Snap = { assets: null, error: false, at: 0 }
const subs = new Set<(s: Snap) => void>()
let timer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<void> | null = null
// Consecutive failures: retries back off (30 s, 60 s, 2 min … up to 5 min)
// instead of hammering a failing endpoint; one success resets it.
let failures = 0
let nextAt = 0

async function load() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/market/assets', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { assets?: unknown }
      // A reply without an asset list is a failure, not "no assets".
      if (!Array.isArray(j?.assets)) throw new Error('Malformed market data')
      snap = { assets: j.assets as AssetQuote[], error: false, at: Date.now() }
      failures = 0; nextAt = 0
    } catch {
      snap = { ...snap, error: true, at: Date.now() }
      failures += 1
      nextAt = Date.now() + Math.min(30_000 * 2 ** (failures - 1), 300_000)
    }
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
      timer = setInterval(() => { if (document.visibilityState === 'visible' && Date.now() >= nextAt) load() }, 30_000)
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      subs.delete(setS)
      if (!subs.size && timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible) }
    }
  }, [])
  return { ...s, reload: load }
}


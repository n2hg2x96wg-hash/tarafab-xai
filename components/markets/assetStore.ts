'use client'

import { useEffect, useState } from 'react'
import type { AssetQuote } from '@/lib/assets'
import { effectiveState, marketNow, setClockSkew, type MarketState } from '@/lib/marketStatus'

// Shared market snapshot (no authentication, no Supabase): one fetch of
// /api/market/assets for every component on the page, refreshed every 30 s
// while the page is visible (paused in background tabs). Kept free of heavy
// imports so the landing page can use it in its first load.
//
// Every surface showing a price (hero, ticker, market board, story, dashboard)
// reads this one snapshot and labels it with lib/marketStatus, so they always
// agree. Labels age on their own: subscribers re-render every 15 s even when
// no new data arrives, so a quote turns stale on screen once it is too old.
// A page brought back after sleeping (tab switch, back/forward cache, phone
// unlock, network back) fetches again straight away.
export type Snap = { assets: AssetQuote[] | null; error: boolean; at: number }
let snap: Snap = { assets: null, error: false, at: 0 }
const subs = new Set<(s: Snap) => void>()
const ticks = new Set<(n: number) => void>()
let timer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<void> | null = null
// Consecutive failures: retries back off (30 s, 60 s, 2 min … up to 5 min)
// instead of hammering a failing endpoint; one success resets it.
let failures = 0
let nextAt = 0

// Server time from the reply (Date, plus Age when a CDN copy answered),
// compared with the middle of the request on this device. Only a clear
// difference (over 30 s) is applied, so ordinary jitter changes nothing.
function syncClock(r: Response, sent: number) {
  const date = Date.parse(r.headers.get('date') || '')
  if (!Number.isFinite(date)) return
  const age = Number(r.headers.get('age')) || 0
  const skew = date + age * 1000 - (sent + Date.now()) / 2
  setClockSkew(Math.abs(skew) > 30_000 ? skew : 0)
}

// A reply can be older than what is already on screen (a cached copy from
// another edge): per asset, a quote with an older provider time never
// replaces a newer one.
export function newestOf(prev: AssetQuote[] | null, next: AssetQuote[]) {
  if (!prev) return next
  const old = new Map(prev.map(a => [a.id, a]))
  return next.map(a => {
    const p = old.get(a.id)
    const tn = a.updatedAt ? Date.parse(a.updatedAt) : NaN, tp = p?.updatedAt ? Date.parse(p.updatedAt) : NaN
    return p && p.price != null && Number.isFinite(tp) && Number.isFinite(tn) && tn < tp ? p : a
  })
}

async function load() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const sent = Date.now()
      const r = await fetch('/api/market/assets', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { assets?: unknown }
      // A reply without an asset list is a failure, not "no assets".
      if (!Array.isArray(j?.assets)) throw new Error('Malformed market data')
      syncClock(r, sent)
      snap = { assets: newestOf(snap.assets, (j.assets as AssetQuote[]).filter(a => a && typeof a.id === 'string')), error: false, at: Date.now() }
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
const visible = () => document.visibilityState === 'visible'
// Back on screen or back online: refresh now if the snapshot is not recent
// (or the last attempt failed), without waiting out a failure back-off that
// started while the page slept.
const onResume = () => {
  if (!visible()) return
  ticks.forEach(f => f(marketNow()))
  const age = Date.now() - snap.at
  if (age > 25_000 || (snap.error && age > 3_000)) { nextAt = 0; load() }
}
const RESUME_EVENTS = ['visibilitychange', 'pageshow', 'focus', 'online'] as const
const listen = (on: boolean) => {
  document[on ? 'addEventListener' : 'removeEventListener']('visibilitychange', onResume)
  RESUME_EVENTS.slice(1).forEach(e => window[on ? 'addEventListener' : 'removeEventListener'](e, onResume))
}

export function useAssets() {
  const [s, setS] = useState<Snap>(snap)
  const [, setTick] = useState(0)
  useEffect(() => {
    subs.add(setS); ticks.add(setTick)
    if (!snap.assets || Date.now() - snap.at > 25_000) load()
    if (!timer) {
      timer = setInterval(() => {
        if (!visible()) return
        ticks.forEach(f => f(marketNow()))
        if (Date.now() >= nextAt && Date.now() - snap.at >= 29_000) load()
      }, 15_000)
      listen(true)
    }
    return () => {
      subs.delete(setS); ticks.delete(setTick)
      if (!subs.size && timer) { clearInterval(timer); timer = null; listen(false) }
    }
  }, [])
  // now: the clock labels are computed against (server-corrected; every
  // subscriber re-renders at least every 15 s).
  return { ...s, now: marketNow(), reload: load }
}

// Bitcoin as every landing surface shows it: the shared snapshot's BTC quote
// with its shared status. No price is shown when there is none.
export type BtcQuote = {
  price: number | null; changePct: number | null; updatedAt: string | null
  state: MarketState | 'loading'; source: AssetQuote['source'] | null
}
export function useBtcQuote(): BtcQuote {
  const { assets, error, now } = useAssets()
  const btc = assets?.find(a => a?.id === 'BTC')
  if (!btc) return { price: null, changePct: null, updatedAt: null, source: null, state: assets === null && !error ? 'loading' : 'unavailable' }
  const state = effectiveState(btc, error, now)
  return {
    price: state === 'unavailable' ? null : btc.price, changePct: state === 'unavailable' ? null : btc.changePct,
    updatedAt: btc.updatedAt, source: btc.source ?? null, state,
  }
}


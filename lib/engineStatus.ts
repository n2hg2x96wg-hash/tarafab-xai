'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/authFetch'

export type EngineState = 'running' | 'paused' | 'maintenance' | 'degraded' | 'offline' | 'unavailable'
export type EnginePresentation = { panel_visible: boolean; preview_visible: boolean; display_name: string; asset_labels: string; description: string; animation: 'off' | 'subtle' | 'standard'; operating_mode?: 'active' | 'paused' | 'maintenance' }
export type EngineStatus = { state: EngineState; last_ok_at: string | null; last_evaluated: number | null; market_at: string | null; monitored_count: number; monitored: string[]; presentation: EnginePresentation; at: string }

const DEFAULT_P: EnginePresentation = { panel_visible: true, preview_visible: true, display_name: 'XAI Automation Engine', asset_labels: 'BTC · ETH · supported assets', description: 'Configure rules that monitor supported markets. The engine evaluates them every minute and records activity for review.', animation: 'standard' }

// One shared fetch of /api/automation/status, refreshed every 60 s while the
// tab is visible. A failure is "unavailable" — never assumed to be running.
let cache: { s: EngineStatus | null; failed: boolean; at: number } = { s: null, failed: false, at: 0 }
const subs = new Set<(c: typeof cache) => void>()
let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null

function parse(v: unknown): EngineStatus | null {
  const o = v as Partial<EngineStatus> | null
  if (!o || typeof o !== 'object' || !['running', 'paused', 'maintenance', 'degraded', 'offline', 'unavailable'].includes(String(o.state))) return null
  return { state: o.state as EngineState, last_ok_at: typeof o.last_ok_at === 'string' ? o.last_ok_at : null,
    last_evaluated: o.last_evaluated != null && Number.isFinite(Number(o.last_evaluated)) ? Number(o.last_evaluated) : null,
    market_at: typeof o.market_at === 'string' ? o.market_at : null,
    monitored_count: Number(o.monitored_count) || 0, monitored: Array.isArray(o.monitored) ? o.monitored.filter(x => typeof x === 'string') : [],
    presentation: { ...DEFAULT_P, ...(o.presentation || {}) }, at: String(o.at || '') }
}
function load() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await authFetch('/api/automation/status', { cache: 'no-store' })
      const s = parse((await r.json().catch(() => null))?.status)
      cache = s && r.ok ? { s, failed: false, at: Date.now() } : { ...cache, failed: true, at: Date.now() }
    } catch { cache = { ...cache, failed: true, at: Date.now() } }
    subs.forEach(f => f(cache))
  })().finally(() => { inflight = null })
  return inflight
}

// Coming back to the tab refreshes at once if the reading is over 20 s old.
// One listener and one timer for the whole page, however many panels mount;
// both are removed when the last one unmounts.
const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - cache.at > 20_000) load() }

export function useEngineStatus() {
  const [c, setC] = useState(cache)
  useEffect(() => {
    subs.add(setC)
    if (!cache.s || Date.now() - cache.at > 50_000) load()
    if (!timer) {
      timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      subs.delete(setC)
      if (!subs.size && timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible) }
    }
  }, [])
  // Running is shown only while it is verified: the engine's own heartbeat
  // must be under 3 min old AND the latest refresh must have succeeded. A
  // failed refresh with an older reading is "Delayed", never "running".
  const s = c.s
  const state: EngineState = !s ? 'unavailable'
    : c.failed && s.state === 'running' ? 'degraded'
    : s.state === 'running' && s.last_ok_at && Date.now() - Date.parse(s.last_ok_at) > 3 * 60_000 ? 'degraded' : s.state
  // The engine is scheduled every minute; next check = last successful cycle + 60 s.
  const nextAt = s?.last_ok_at && (state === 'running') ? Date.parse(s.last_ok_at) + 60_000 : null
  return { status: s, state, loading: !s && !c.failed, refreshed: c.at, refreshFailed: c.failed, nextAt, presentation: s?.presentation ?? DEFAULT_P }
}

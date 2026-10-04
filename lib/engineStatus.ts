'use client'

import { useEffect, useState } from 'react'

export type EngineState = 'running' | 'degraded' | 'offline' | 'unavailable'
export type EnginePresentation = { panel_visible: boolean; preview_visible: boolean; display_name: string; asset_labels: string; description: string; animation: 'off' | 'subtle' | 'standard' }
export type EngineStatus = { state: EngineState; last_ok_at: string | null; monitored_count: number; monitored: string[]; presentation: EnginePresentation; at: string }

const DEFAULT_P: EnginePresentation = { panel_visible: true, preview_visible: true, display_name: 'XAI Automation Engine', asset_labels: 'BTC · ETH · supported assets', description: 'Configure rules that monitor supported markets. The engine evaluates them every minute and records activity for review.', animation: 'standard' }

// One shared fetch of /api/automation/status, refreshed every 60 s while the
// tab is visible. A failure is "unavailable" — never assumed to be running.
let cache: { s: EngineStatus | null; failed: boolean; at: number } = { s: null, failed: false, at: 0 }
const subs = new Set<(c: typeof cache) => void>()
let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null

function parse(v: unknown): EngineStatus | null {
  const o = v as Partial<EngineStatus> | null
  if (!o || typeof o !== 'object' || !['running', 'degraded', 'offline', 'unavailable'].includes(String(o.state))) return null
  return { state: o.state as EngineState, last_ok_at: typeof o.last_ok_at === 'string' ? o.last_ok_at : null,
    monitored_count: Number(o.monitored_count) || 0, monitored: Array.isArray(o.monitored) ? o.monitored.filter(x => typeof x === 'string') : [],
    presentation: { ...DEFAULT_P, ...(o.presentation || {}) }, at: String(o.at || '') }
}
function load() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/automation/status', { cache: 'no-store' })
      const s = parse((await r.json().catch(() => null))?.status)
      cache = s && r.ok ? { s, failed: false, at: Date.now() } : { ...cache, failed: true, at: Date.now() }
    } catch { cache = { ...cache, failed: true, at: Date.now() } }
    subs.forEach(f => f(cache))
  })().finally(() => { inflight = null })
  return inflight
}

export function useEngineStatus() {
  const [c, setC] = useState(cache)
  useEffect(() => {
    subs.add(setC)
    if (!cache.s || Date.now() - cache.at > 50_000) load()
    if (!timer) timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
    return () => { subs.delete(setC); if (!subs.size && timer) { clearInterval(timer); timer = null } }
  }, [])
  // A stale reading (the status itself older than 3 min) is not trusted as running.
  const s = c.s
  const state: EngineState = !s ? (c.failed ? 'unavailable' : 'unavailable')
    : s.state === 'running' && s.last_ok_at && Date.now() - Date.parse(s.last_ok_at) > 3 * 60_000 ? 'degraded' : s.state
  return { status: s, state, loading: !s && !c.failed, presentation: s?.presentation ?? DEFAULT_P }
}

'use client'

import { useEffect, useState } from 'react'
import type { FeatureKey, FeatureState } from '@/lib/features'

// Feature states for display only: API routes enforce them on the server.
// The state always comes from the server (never stored in localStorage or
// sessionStorage) and is re-checked when the tab regains focus and every
// minute while visible, so an admin change reaches open sessions without a
// reload. Until the first answer arrives, Premium and Live chat are treated as hidden (it
// must never flash on when switched off); other modules stay visible so a
// network blip never hides core features.
let cache: { v: Partial<Record<FeatureKey, FeatureState>>; at: number; ok: boolean; p?: Promise<void> } = { v: {}, at: 0, ok: false }
const subs = new Set<() => void>()
async function load() {
  try {
    const r = await fetch('/api/features', { cache: 'no-store' })
    const j = await r.json() as { features?: Record<string, FeatureState> }
    cache = { v: j.features || {}, at: Date.now(), ok: true }
  } catch { cache = { ...cache, at: Date.now() } }
  subs.forEach(f => f())
}
export function refreshFeatures() { cache.p = load(); return cache.p }

const STRICT: FeatureKey[] = ['premium', 'live_chat']
let wired = false
function wire() {
  if (wired || typeof window === 'undefined') return
  wired = true
  const stale = () => document.visibilityState === 'visible' && Date.now() - cache.at > 15_000 && refreshFeatures()
  document.addEventListener('visibilitychange', stale)
  window.addEventListener('focus', stale)
  setInterval(() => { if (document.visibilityState === 'visible' && subs.size) refreshFeatures() }, 60_000)
}

export function useFeatures() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    subs.add(f); wire()
    if (!cache.p || Date.now() - cache.at > 15_000) refreshFeatures()
    return () => { subs.delete(f) }
  }, [])
  return (key: FeatureKey): FeatureState => cache.v[key] || (!cache.ok && STRICT.includes(key) ? 'unavailable' : 'enabled')
}
// True once the server's answer has arrived (not before the first load).
export const featuresLoaded = () => cache.ok
export const hiddenState = (s: FeatureState) => s === 'disabled' || s === 'unavailable' || s === 'admin_only'

'use client'

import { useEffect, useState } from 'react'
import type { FeatureKey, FeatureState } from '@/lib/features'

// Feature states for display only (API routes enforce them). Missing or
// unreadable states count as enabled, so a network blip never hides features.
let cache: { v: Partial<Record<FeatureKey, FeatureState>>; at: number; p?: Promise<void> } = { v: {}, at: 0 }
const subs = new Set<() => void>()
async function load() {
  try {
    const r = await fetch('/api/features')
    const j = await r.json() as { features?: Record<string, FeatureState> }
    cache = { v: j.features || {}, at: Date.now() }
  } catch { cache = { ...cache, at: Date.now() } }
  subs.forEach(f => f())
}
export function useFeatures() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    subs.add(f)
    if (!cache.p || Date.now() - cache.at > 60_000) cache.p = load()
    return () => { subs.delete(f) }
  }, [])
  return (key: FeatureKey): FeatureState => cache.v[key] || 'enabled'
}
export const hiddenState = (s: FeatureState) => s === 'disabled' || s === 'unavailable' || s === 'admin_only'

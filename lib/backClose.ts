'use client'

import { useCallback, useEffect, useRef } from 'react'

// Full-screen layers (see components/AppScreen) behave like app screens: the
// phone's Back button or swipe-back closes the top one instead of leaving the
// page. Each open layer adds one history entry tagged with its depth; a
// popstate closes every layer above the entry the browser landed on. Closing
// a layer any other way (its own back button, Escape) pops that entry again,
// so the history never collects stale steps.
type Layer = { depth: number; close: () => void; after?: () => void }
const layers: Layer[] = []
let listening = false

const depthOf = (state: unknown) => Number((state as { tfScreen?: number } | null)?.tfScreen) || 0

function onPop(e: PopStateEvent) {
  const d = depthOf(e.state)
  const closing = layers.filter(l => l.depth > d).reverse()
  for (const l of closing) l.close()
  // Run follow-ups (e.g. "go to Investments") once the entry is gone, so the
  // section change lands on the page's own entry, not the closed layer's.
  for (const l of closing) if (l.after) { const f = l.after; l.after = undefined; setTimeout(f, 0) }
}

/** Ties a mounted layer to the history. Returns `dismiss(after?)`: the way
 *  every in-layer control closes it (runs `onClose`, then `after`). */
export function useBackClose(onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const layerRef = useRef<Layer | null>(null)

  useEffect(() => {
    const depth = (layers.length ? layers[layers.length - 1].depth : 0) + 1
    const layer: Layer = { depth, close: () => closeRef.current() }
    layers.push(layer)
    layerRef.current = layer
    try {
      // An entry already at this depth is reused (a remount, or Forward back
      // onto it). The drawer's own marker is left out: the entry is the layer's.
      if (depthOf(window.history.state) !== depth) {
        const state = { ...(window.history.state || {}), tfScreen: depth }
        delete state.ccDrawer
        window.history.pushState(state, '')
      }
    } catch { /* history unavailable: Escape and the buttons still close it */ }
    if (!listening) { window.addEventListener('popstate', onPop); listening = true }
    return () => {
      const i = layers.indexOf(layer)
      if (i >= 0) layers.splice(i, 1)
      layerRef.current = null
      // Closed without Back (e.g. the page replaced it): drop its entry, unless
      // a layer took that depth straight away (a remount).
      setTimeout(() => {
        try { if (!layers.some(l => l.depth >= depth) && depthOf(window.history.state) === depth) window.history.back() } catch { /* ignore */ }
      }, 0)
    }
  }, [])

  return useCallback((after?: () => void) => {
    const layer = layerRef.current
    try {
      if (layer && depthOf(window.history.state) === layer.depth) {
        layer.after = after
        window.history.back() // popstate closes it, then runs `after`
        return
      }
    } catch { /* fall through */ }
    closeRef.current()
    if (after) setTimeout(after, 0)
  }, [])
}

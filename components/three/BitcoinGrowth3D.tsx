'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Place, Variant } from './bitcoinScene'

/* Live 3D Bitcoin with a rising growth line (decorative). three.js and the
   scene are fetched only when this comes near the screen and the browser is
   idle, so they never delay the first paint. Until the first frame is drawn
   (and whenever WebGL is unavailable) the `fallback` is shown instead. */
export default function BitcoinGrowth3D({ variant, place, scrollRef, className = '', fallback }: {
  variant: Variant
  place: (w: number, h: number) => Place
  scrollRef?: RefObject<HTMLElement>
  className?: string
  fallback?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const placeRef = useRef(place)
  placeRef.current = place
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle')

  useEffect(() => {
    const el = host.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let alive = true, dispose: (() => void) | null = null, started = false
    const supportsGL = () => {
      try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
    }
    const start = async () => {
      if (started || !alive) return
      started = true
      if (!supportsGL()) { setState('failed'); return }
      try {
        const mod = await import('./bitcoinScene')
        if (!alive) return
        dispose = mod.mountBitcoinScene(el, {
          variant,
          place: (w, h) => placeRef.current(w, h),
          scrollEl: scrollRef?.current ?? null,
          onFirstFrame: () => { if (alive) setState('ready') },
          onFail: () => { if (alive) setState('failed') },
        })
      } catch {
        if (alive) setState('failed')
      }
    }
    const idle = (f: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 1200 }); else setTimeout(f, 200)
    }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); idle(start) } }, { rootMargin: '200px' })
    io.observe(el)
    return () => { alive = false; io.disconnect(); dispose?.() }
  }, [variant, scrollRef])

  return (
    <div className={`btc3d ${className}`} data-btc3d={state} aria-hidden="true">
      {state !== 'ready' && fallback}
      <div ref={host} className="btc3d-host" />
    </div>
  )
}

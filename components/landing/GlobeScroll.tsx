'use client'

import { useEffect, useRef, useState } from 'react'

// Section B of the landing page: the giant particle globe, between the hero
// and the information below it. The section is taller than the screen and
// its stage stays pinned (CSS sticky) while the visitor scrolls through it;
// the WebGL scene (components/three/globeScene) reads that scroll position
// to raise, turn and light the planet, then fades it into the next section.
// Scrolling itself is never intercepted.
// - three.js and the scene load only when the section nears the screen.
// - The supplied globe artwork is shown until the first frame is drawn, and
//   stays as the fallback when WebGL is unavailable or fails.
// - Reduced motion: the still artwork in a shorter section, no 3D.
// Decorative: no text, links or focusable elements of its own.
export const GLOBE_IMAGE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/f1631235-0a76-464d-8f1d-2c4b48a997d5.jpg'

export default function GlobeScroll() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'pending' | 'still' | '3d'>('pending')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let gl = false
    try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { /* no WebGL */ }
    setMode(reduce || !gl ? 'still' : '3d')
  }, [])

  useEffect(() => {
    const el = section.current, h = host.current, st = stage.current
    if (mode !== '3d' || !el || !h || !st || typeof IntersectionObserver === 'undefined') return
    let alive = true, dispose: (() => void) | null = null, started = false
    const start = async () => {
      if (started || !alive) return
      started = true
      try {
        const mod = await import('@/components/three/globeScene')
        if (!alive) return
        dispose = mod.mountGlobeScene(h, {
          section: el,
          onFirstFrame: () => { if (alive) setReady(true) },
          onFail: () => { if (alive) { setReady(false); setMode('still') } },
          // A CSS variable (no re-render) for the cue and the edge fades.
          onProgress: p => st.style.setProperty('--gp', p.toFixed(3)),
        })
      } catch { if (alive) setMode('still') }
    }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); start() } }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => { alive = false; io.disconnect(); dispose?.() }
  }, [mode])

  return (
    <section ref={section} className={`gx ${mode === 'still' ? 'gx-still' : ''}`} aria-hidden="true" data-globe-scroll data-globe-mode={mode === '3d' && ready ? '3d' : mode === 'still' ? 'still' : 'loading'}>
      <div ref={stage} className="gx-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote artwork shown as-is; the CSS sizes it */}
        {!ready && <img src={GLOBE_IMAGE} alt="" className="gx-still-img" decoding="async" loading="lazy" data-globe-image />}
        <div ref={host} className={`gx-canvas ${ready ? 'is-on' : ''}`} />
        <div className="gx-shade" />
        <div className="gx-cue">
          <span className="gx-mouse"><span /></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /><path d="m6 4 6 6 6-6" opacity=".5" /></svg>
        </div>
      </div>
    </section>
  )
}

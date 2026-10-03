'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// Restrained motion for the client Overview. Transform/opacity only, no
// timers, nothing runs while off screen, and reduced-motion users get the
// final state (see .ov-rise / .ov-depth in globals.css).

// Rises gently into place the first time it comes on screen. Never used for
// the balance card or header, which must appear immediately.
export function Rise({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setShown(true); io.disconnect() } }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`ov-rise ${className}`} data-in={shown || undefined} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>
}

// Sets --ov-p (0 → 1, how far the element has travelled through the
// viewport) on the element. One passive scroll listener, attached only while
// the element is on screen and throttled to one update per frame; React does
// not re-render on scroll.
export function useScrollDepth(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 1
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
      el.style.setProperty('--ov-p', p.toFixed(3))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const io = new IntersectionObserver(e => {
      // data-vis gates CSS animations, so nothing animates off screen.
      if (e[0].isIntersecting) el.dataset.vis = ''; else delete el.dataset.vis
      if (reduce) return
      if (e[0].isIntersecting) { update(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll) }
      else { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
    })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [ref])
}

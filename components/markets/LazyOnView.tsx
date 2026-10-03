'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

// Loads a heavy section's code only when it nears the viewport, so it adds
// nothing to the page's initial JavaScript. The code is also PREFETCHED once
// the browser is idle, so by the time the visitor scrolls to it there is no
// wait. While loading, a visible skeleton of the same height holds the space
// (no blank gap, no layout jump); a failed load offers a retry instead of
// leaving the space empty.
// id: an anchor (e.g. "markets") that must exist before the section loads, so
// in-page links and shared /#markets URLs can scroll to it straight away.
export default function LazyOnView({ load, minHeight = 520, id }: { load: () => Promise<{ default: ComponentType }>; minHeight?: number; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [C, setC] = useState<ComponentType | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const keep = useRef<number | null>(null)
  useEffect(() => {
    // Idle prefetch: downloads the chunk without mounting anything.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    const pre = () => { load().catch(() => {}) }
    if (w.requestIdleCallback) { const h = w.requestIdleCallback(pre, { timeout: 4000 }); return () => w.cancelIdleCallback?.(h) }
    const t = setTimeout(pre, 2500); return () => clearTimeout(t)
  }, [load])
  useEffect(() => {
    const el = ref.current; if (!el) return
    let alive = true
    const io = new IntersectionObserver(e => {
      if (!e[0].isIntersecting) return
      io.disconnect()
      load().then(m => {
        if (!alive) return
        // Mounting a section that starts above the viewport (e.g. after a jump
        // to #markets) must not push what the visitor is looking at down the
        // page: remember the placeholder's height to compensate for growth.
        keep.current = el.getBoundingClientRect().height
        setC(() => m.default)
      }).catch(() => { if (alive) setFailed(true) })
    }, { rootMargin: '600px' })
    io.observe(el); return () => { alive = false; io.disconnect() }
  }, [load, attempt])
  useLayoutEffect(() => {
    const w = wrap.current
    if (!C || keep.current == null || !w) return
    let last = keep.current
    keep.current = null
    // While the section's top is above the viewport, every change in its
    // height is matched by the same scroll, so the content below stays put.
    // Watched briefly after mounting (late layout: fonts, mode switch).
    const fit = () => {
      const r = w.getBoundingClientRect()
      if (r.top < 0 && Math.abs(r.height - last) > 1) window.scrollBy(0, r.height - last)
      last = r.height
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit); ro.observe(w)
    const t = setTimeout(() => ro.disconnect(), 3000)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [C])
  if (C) return <div ref={wrap} id={id} className={id ? 'scroll-mt-16' : undefined} style={{ overflowAnchor: 'none' }}><C /></div>
  return (
    <div ref={ref} id={id} style={{ minHeight }} className={`${minHeight ? 'max-w-6xl mx-auto px-4 sm:px-6 py-14' : ''} ${id ? 'scroll-mt-16' : ''}`}>
      {failed ? (
        <div className="panel p-6 text-center text-sm text-fg-muted" role="status">
          This section could not be loaded.{' '}
          <button className="underline underline-offset-2 hover:text-fg" onClick={() => { setFailed(false); setAttempt(a => a + 1) }}>Try again</button>
        </div>
      ) : minHeight ? <SectionSkeleton height={minHeight - 112} /> : null}
    </div>
  )
}

// Mounts children (and therefore starts their network requests, third-party
// scripts and timers) only when the block nears the viewport. Until then a
// skeleton of the same height keeps the layout stable.
export function MountOnView({ children, minHeight = 0, rootMargin = '300px', className = '' }: { children: ReactNode; minHeight?: number; rootMargin?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el || on) return
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); setOn(true) } }, { rootMargin })
    io.observe(el); return () => io.disconnect()
  }, [on, rootMargin])
  if (on) return <>{children}</>
  return (
    <div ref={ref} className={`relative ${className}`} style={minHeight ? { minHeight } : undefined} data-mount-placeholder>
      <div className="absolute inset-0 rounded-xl border border-ink-700/70 bg-ink-900/40 overflow-hidden" aria-hidden="true"><div className="h-full w-full skeleton-sheen" /></div>
    </div>
  )
}

export function SectionSkeleton({ height }: { height: number }) {
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 overflow-hidden" style={{ height: Math.max(height, 80) }} aria-hidden="true">
      <div className="h-full w-full skeleton-sheen" />
    </div>
  )
}

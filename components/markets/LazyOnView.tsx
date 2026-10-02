'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'

// Loads a heavy section only when it nears the viewport, so it adds nothing to
// the page's initial JavaScript.
export default function LazyOnView({ load, minHeight = 520 }: { load: () => Promise<{ default: ComponentType }>; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [C, setC] = useState<ComponentType | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); load().then(m => setC(() => m.default)).catch(() => {}) } }, { rootMargin: '400px' })
    io.observe(el); return () => io.disconnect()
  }, [load])
  return C ? <C /> : <div ref={ref} style={{ minHeight }} aria-hidden="true" />
}

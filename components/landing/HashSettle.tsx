'use client'

import { useEffect } from 'react'

// In-page links ("#markets") scroll smoothly to a target whose position is
// worked out when the scroll starts. Sections that load on the way (lazy
// story, intelligence) can then make the page taller above the target and the
// visitor would land in the wrong place. For a few seconds after a jump, once
// scrolling comes to rest the target is re-aimed if it is off; any scrolling
// by the visitor (wheel, touch, keys) ends this immediately.
export default function HashSettle() {
  useEffect(() => {
    let stop: (() => void) | null = null
    const settle = () => {
      stop?.()
      const id = decodeURIComponent(location.hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (!el) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Checks the outcome rather than individual events: whenever scrolling
      // has come to rest and the target is not where a jump puts it, aim again.
      let lastY = -1
      const tick = () => {
        const y = window.scrollY
        const resting = y === lastY
        lastY = y
        if (!resting) return
        const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
        const off = el.getBoundingClientRect().top - want
        const atEnd = off > 0 && window.innerHeight + y >= document.documentElement.scrollHeight - 1
        if (Math.abs(off) > 4 && !atEnd) el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }
      const iv = setInterval(tick, 150)
      const cancel = () => stop?.()
      const t = setTimeout(cancel, 6000)
      window.addEventListener('wheel', cancel, { passive: true })
      window.addEventListener('touchstart', cancel, { passive: true })
      window.addEventListener('keydown', cancel)
      stop = () => {
        clearInterval(iv); clearTimeout(t)
        window.removeEventListener('wheel', cancel)
        window.removeEventListener('touchstart', cancel)
        window.removeEventListener('keydown', cancel)
        stop = null
      }
    }
    // Clicking a link to the hash already in the URL fires no hashchange.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (a && a.getAttribute('href') === location.hash) setTimeout(settle, 0)
    }
    settle()
    window.addEventListener('hashchange', settle)
    document.addEventListener('click', onClick)
    return () => { window.removeEventListener('hashchange', settle); document.removeEventListener('click', onClick); stop?.() }
  }, [])
  return null
}

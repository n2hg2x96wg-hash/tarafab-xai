'use client'

import { useEffect, useRef } from 'react'

// Original "global market intelligence" visual: a rotating dotted globe with
// connection points, arcs and data pulses. It is a decorative illustration
// (labelled as such): the labels are asset symbols only, with no prices,
// movements or activity. Draws on a 2D canvas, pauses when off screen or when
// the tab is hidden, and stays still with reduced motion.
const NODES: { sym: string; lat: number; lon: number }[] = [
  { sym: 'BTC', lat: 35.7, lon: 139.7 }, { sym: 'ETH', lat: 51.5, lon: -0.1 }, { sym: 'SOL', lat: 1.35, lon: 103.8 },
  { sym: 'TSLA', lat: 30.3, lon: -97.7 }, { sym: 'NVDA', lat: 37.4, lon: -122.1 }, { sym: 'AAPL', lat: 40.7, lon: -74 },
  { sym: 'SPX', lat: 50.1, lon: 8.7 }, { sym: 'XRP', lat: 25.2, lon: 55.3 }, { sym: 'MSFT', lat: -23.5, lon: -46.6 }, { sym: 'AMZN', lat: -33.9, lon: 151.2 },
]
const ARCS: [number, number][] = [[0, 2], [2, 7], [7, 6], [6, 1], [1, 5], [5, 3], [3, 4], [4, 0], [5, 8], [2, 9], [1, 7], [6, 0]]
const rad = (d: number) => (d * Math.PI) / 180

export default function GlobalMarketVisual({ label }: { label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext('2d'); if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf = 0, visible = true, rot = rad(-40), last = 0
    const dots: [number, number][] = []
    for (let lat = -80; lat <= 80; lat += 6) { const n = Math.max(6, Math.round(60 * Math.cos(rad(lat)))); for (let i = 0; i < n; i++) dots.push([lat, (i / n) * 360 - 180]) }
    const style = getComputedStyle(document.documentElement)
    const rgb = (v: string, a: number) => `rgb(${style.getPropertyValue(v).trim() || '247 147 26'} / ${a})`
    const resize = () => {
      const r = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const project = (lat: number, lon: number, R: number, cx: number, cy: number) => {
      const φ = rad(lat), λ = rad(lon) + rot
      const x = Math.cos(φ) * Math.sin(λ), y = Math.sin(φ), z = Math.cos(φ) * Math.cos(λ)
      return { x: cx + R * x, y: cy - R * y, z }
    }
    const draw = (t: number) => {
      const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2
      ctx.clearRect(0, 0, w, h)
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25)
      g.addColorStop(0, rgb('--accent', 0.10)); g.addColorStop(1, rgb('--accent', 0))
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = rgb('--fg-faint', 0.25); ctx.lineWidth = 1; ctx.stroke()
      for (const [lat, lon] of dots) { const p = project(lat, lon, R, cx, cy); if (p.z <= 0) continue; ctx.fillStyle = rgb('--fg-muted', 0.18 + p.z * 0.4); ctx.fillRect(p.x, p.y, 1.6, 1.6) }
      const pts = NODES.map(n => project(n.lat, n.lon, R, cx, cy))
      ARCS.forEach(([a, b], i) => {
        const A = pts[a], B = pts[b]; if (A.z <= 0 && B.z <= 0) return
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = mx - cx, dy = my - cy, len = Math.hypot(dx, dy) || 1
        const lift = Math.min(R * 0.35, Math.hypot(A.x - B.x, A.y - B.y) * 0.4)
        const qx = mx + (dx / len) * lift, qy = my + (dy / len) * lift
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(qx, qy, B.x, B.y); ctx.strokeStyle = rgb('--accent', 0.28); ctx.lineWidth = 1; ctx.stroke()
        if (!reduce) { const u = ((t / 2600 + i * 0.37) % 1), v = 1 - u; ctx.beginPath(); ctx.arc(v * v * A.x + 2 * v * u * qx + u * u * B.x, v * v * A.y + 2 * v * u * qy + u * u * B.y, 2, 0, Math.PI * 2); ctx.fillStyle = rgb('--accent', 0.95); ctx.fill() }
      })
      ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle'
      NODES.forEach((n, i) => {
        const p = pts[i]; if (p.z <= 0.05) return
        const pulse = reduce ? 0 : (Math.sin(t / 700 + i) + 1) / 2
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + pulse * 3, 0, Math.PI * 2); ctx.fillStyle = rgb('--accent', 0.15 + pulse * 0.12); ctx.fill()
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fillStyle = rgb('--accent', 1); ctx.fill()
        ctx.fillStyle = rgb('--fg', 0.9); ctx.fillText(n.sym, p.x + 8, p.y - 8)
      })
    }
    const frame = (t: number) => {
      raf = 0
      if (!visible || document.visibilityState === 'hidden') return
      if (t - last > 33) { rot += reduce ? 0 : 0.0035; last = t; draw(t) }
      raf = requestAnimationFrame(frame)
    }
    const start = () => { if (!raf && visible) raf = requestAnimationFrame(frame) }
    resize(); draw(0)
    const ro = new ResizeObserver(() => { resize(); draw(performance.now()) }); ro.observe(canvas)
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) start() }, { threshold: 0.05 }); io.observe(canvas)
    const vis = () => start(); document.addEventListener('visibilitychange', vis)
    start()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return <canvas ref={ref} role="img" aria-label={label} className="w-full aspect-square max-w-[520px] mx-auto" />
}

'use client'

import { useEffect, useRef } from 'react'

// Decorative background for the hero: a faint grid of nodes joined by thin
// paths, with a few slow light particles travelling along them. It carries no
// data and no labels, so it cannot be mistaken for trading activity.
//
// Cost control:
//   - prefers-reduced-motion: one static frame, no animation loop
//   - phones / coarse pointers: fewer nodes and particles, no pointer parallax
//   - the loop stops while the hero is off screen or the tab is hidden
//   - device pixel ratio is capped
export function AmbientField({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
    const rgb = (name: string, fallback: string) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback).replace(/\s+/g, ',')
    let accent = rgb('--accent', '247 147 26')
    let cool = rgb('--brand-500', '124 92 255')

    type Node = { x: number; y: number; phase: number }
    type Edge = [number, number]
    type Particle = { edge: number; t: number; speed: number }
    let nodes: Node[] = [], edges: Edge[] = [], particles: Particle[] = []
    let w = 0, h = 0, raf = 0, running = false, visible = true
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      accent = rgb('--accent', '247 147 26'); cool = rgb('--brand-500', '124 92 255')
      const gap = coarse ? 150 : 120
      const cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1
      // Deterministic jitter so the layout is stable between resizes.
      const rand = (i: number) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s) }
      nodes = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (rand(i + 7) < 0.35) continue // leave gaps so it reads as a network, not a mesh
        nodes.push({ x: c * gap + (rand(i) - 0.5) * gap * 0.5, y: r * gap + (rand(i + 99) - 0.5) * gap * 0.5, phase: rand(i + 3) * Math.PI * 2 })
      }
      edges = []
      nodes.forEach((a, i) => {
        nodes.forEach((b, j) => {
          if (j <= i) return
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < gap * 1.25 && rand(i * 31 + j) < 0.55) edges.push([i, j])
        })
      })
      const count = reduced ? 0 : coarse ? 6 : 16
      particles = Array.from({ length: Math.min(count, edges.length) }, (_, k) => ({ edge: Math.floor(rand(k + 500) * edges.length), t: rand(k + 900), speed: 0.0012 + rand(k + 77) * 0.0016 }))
    }

    const draw = (time: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
      const ox = pointer.x * 10, oy = pointer.y * 8
      ctx.clearRect(0, 0, w, h)
      // Faint paths
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(${cool},0.07)`
      ctx.beginPath()
      for (const [i, j] of edges) { ctx.moveTo(nodes[i].x + ox, nodes[i].y + oy); ctx.lineTo(nodes[j].x + ox, nodes[j].y + oy) }
      ctx.stroke()
      // Nodes with a slow pulse
      for (const n of nodes) {
        const p = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time / 1800 + n.phase)
        ctx.fillStyle = `rgba(${accent},${0.10 + p * 0.18})`
        ctx.beginPath(); ctx.arc(n.x + ox, n.y + oy, 1.4 + p * 0.8, 0, Math.PI * 2); ctx.fill()
      }
      // Light particles moving along paths
      for (const pt of particles) {
        pt.t += pt.speed
        if (pt.t >= 1) { pt.t = 0; pt.edge = (pt.edge * 7 + 13) % edges.length }
        const [i, j] = edges[pt.edge]
        const x = nodes[i].x + (nodes[j].x - nodes[i].x) * pt.t + ox
        const y = nodes[i].y + (nodes[j].y - nodes[i].y) * pt.t + oy
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10)
        g.addColorStop(0, `rgba(${accent},${coarse ? 0.3 : 0.5})`); g.addColorStop(1, `rgba(${accent},0)`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
      }
    }

    const loop = (time: number) => { draw(time); raf = requestAnimationFrame(loop) }
    const start = () => { if (reduced || running || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(loop) }
    const stop = () => { running = false; cancelAnimationFrame(raf) }

    build(); draw(0); start()

    const ro = new ResizeObserver(() => { build(); draw(performance.now()) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop() })
    io.observe(canvas)
    const onVis = () => { if (document.hidden) stop(); else start() }
    document.addEventListener('visibilitychange', onVis)
    const onMove = (e: PointerEvent) => { pointer.tx = e.clientX / window.innerWidth - 0.5; pointer.ty = e.clientY / window.innerHeight - 0.5 }
    if (!coarse && !reduced) window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      stop(); ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 w-full h-full ${className}`} aria-hidden="true" />
}

'use client'

import { useId, useMemo, useState } from 'react'

// Lightweight SVG charts. They only draw real points; with no data they draw
// nothing (callers show an unavailable state).
function path(points: [number, number][], w: number, h: number, pad = 2) {
  if (points.length < 2) return { line: '', area: '', min: 0, max: 0, xy: [] as [number, number][], sx: (x: number) => x, sy: (y: number) => y }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (w - pad * 2)
  const sy = (y: number) => pad + (1 - (y - y0) / (y1 - y0 || 1)) * (h - pad * 2)
  const xy = points.map(p => [sx(p[0]), sy(p[1])] as [number, number])
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  return { line, area: `${line}L${xy[xy.length - 1][0].toFixed(1)},${h}L${xy[0][0].toFixed(1)},${h}Z`, min: y0, max: y1, xy, sx, sy }
}

// Simple moving average of the real closes; null until enough points exist.
export function sma(points: [number, number][], n: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i][1]
    if (i >= n) sum -= points[i - n][1]
    out.push(i >= n - 1 ? sum / n : null)
  }
  return out
}
export type Overlay = { values: (number | null)[]; color: string; label: string }

export function Sparkline({ points, up, className = '' }: { points: [number, number][]; up: boolean | null; className?: string }) {
  const id = useId()
  const { line, area } = useMemo(() => path(points, 120, 36), [points])
  if (!line) return <div className={className} aria-hidden="true" />
  const c = up == null ? 'rgb(var(--fg-faint))' : up ? 'rgb(var(--success-400))' : 'rgb(var(--danger-400))'
  return (
    <svg viewBox="0 0 120 36" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".28" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="spark-draw" />
    </svg>
  )
}

export function AreaChart({ points, up, format, label, overlays = [] }: { points: [number, number][]; up: boolean | null; format: (n: number) => string; label: string; overlays?: Overlay[] }) {
  const id = useId()
  const W = 600, H = 220
  const { line, area, xy, sx, sy } = useMemo(() => path(points, W, H, 8), [points])
  const lines = useMemo(() => overlays.map(o => ({ ...o, d: o.values.map((v, i) => (v == null ? '' : `${o.values[i - 1] == null ? 'M' : 'L'}${sx(points[i][0]).toFixed(1)},${sy(v).toFixed(1)}`)).join('') })), [overlays, points, sx, sy])
  const [hover, setHover] = useState<number | null>(null)
  if (!line) return null
  const c = up == null ? 'rgb(var(--fg-muted))' : up ? 'rgb(var(--success-400))' : 'rgb(var(--danger-400))'
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W
    let best = 0; for (let i = 1; i < xy.length; i++) if (Math.abs(xy[i][0] - x) < Math.abs(xy[best][0] - x)) best = i
    setHover(best)
  }
  const h = hover != null ? points[hover] : null
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] sm:h-[240px] touch-none" role="img" aria-label={label}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".22" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill={`url(#${id})`} className="chart-fade" />
        <path d={line} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" className="spark-draw" />
        {lines.map(l => l.d && <path key={l.label} d={l.d} fill="none" stroke={l.color} strokeWidth="1.5" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" className="chart-fade" />)}
        {hover != null && <><line x1={xy[hover][0]} x2={xy[hover][0]} y1="0" y2={H} stroke="rgb(var(--fg-faint))" strokeDasharray="3 3" /><circle cx={xy[hover][0]} cy={xy[hover][1]} r="4" fill={c} /></>}
      </svg>
      {lines.length > 0 && (
        <div className="pointer-events-none absolute top-2 right-2 flex gap-2 text-[11px]">
          {lines.map(l => <span key={l.label} className="flex items-center gap-1 text-fg-muted"><span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: l.color }} />{l.label}</span>)}
        </div>
      )}
      {h && (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-ink-700 bg-ink-900/90 px-2 py-1 text-[12px] tabular-nums text-fg">
          {format(h[1])} <span className="text-fg-faint">· {new Date(h[0]).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

export type Day = { day: string; signups: number; deposits: number; withdrawals: number }

const SERIES = [
  { key: 'signups', label: 'Sign-ups', cls: 'bg-violet-400' },
  { key: 'deposits', label: 'Deposits', cls: 'bg-emerald-400' },
  { key: 'withdrawals', label: 'Withdrawals', cls: 'bg-sky-400' },
] as const

function fmtDay(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// 14 days of recorded activity as columns on a gently tilted floor. The only
// motion is a one-time grow-in when the chart first comes on screen (CSS
// transform, no timers, nothing running afterwards); reduced-motion users get
// the final state. Every column is a real count from admin_overview().
export default function OpsChart({ days }: { days: Day[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.25 })
    io.observe(el); return () => io.disconnect()
  }, [])

  const totals = days.map(d => d.signups + d.deposits + d.withdrawals)
  const max = Math.max(1, ...totals)
  const sum = (k: (typeof SERIES)[number]['key']) => days.reduce((n, d) => n + d[k], 0)
  const sel = pick != null ? days[pick] : null
  const empty = totals.every(t => t === 0)

  return (
    <div ref={ref} className="ops-chart" data-shown={shown || undefined}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 mb-3">
        {SERIES.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-sm ${s.cls}`} aria-hidden="true" />{s.label} <span className="text-white tabular-nums">{sum(s.key)}</span></span>
        ))}
        <span className="ml-auto text-slate-500">Last 14 days</span>
      </div>
      <div className="ops-stage" aria-hidden="true">
        <div className="ops-floor">
          {days.map((d, i) => {
            const h = (totals[i] / max) * 100
            return (
              <div key={d.day} className={`ops-col ${pick === i ? 'is-picked' : ''}`} style={{ ['--h' as string]: `${h}%`, ['--i' as string]: i }}
                onMouseEnter={() => setPick(i)} onMouseLeave={() => setPick(null)}>
                <div className="ops-bar">
                  {SERIES.map(s => d[s.key] > 0 && <span key={s.key} className={s.cls} style={{ flexGrow: d[s.key] }} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1.5" aria-hidden="true">
        <span>{days[0] ? fmtDay(days[0].day) : ''}</span><span>Today</span>
      </div>
      {/* Screen readers and keyboard users get the same numbers as a list. */}
      <p className="mt-2 text-[12px] text-slate-400 min-h-[18px]" aria-live="polite">
        {sel ? `${fmtDay(sel.day)}: ${sel.signups} sign-ups · ${sel.deposits} deposits · ${sel.withdrawals} withdrawals`
          : empty ? 'No sign-ups, deposits or withdrawals recorded in the last 14 days.' : 'Hover a column for that day’s numbers.'}
      </p>
      <ul className="sr-only">
        {days.map(d => <li key={d.day}>{fmtDay(d.day)}: {d.signups} sign-ups, {d.deposits} deposits, {d.withdrawals} withdrawals</li>)}
      </ul>
    </div>
  )
}

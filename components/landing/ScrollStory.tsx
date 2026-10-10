'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAssets } from '@/components/markets/assetStore'
import { formatPrice } from '@/lib/assets'
import { effectiveState } from '@/lib/marketStatus'

// "How Tarafab works": one compact sequence, Market data → Condition
// evaluation → Recorded result, as a single composition (three panels in a
// row on wide screens, a vertical timeline on phones). It replaces the
// earlier long scroll-driven 3D stack, whose layered panels showed through
// each other and needed several screens of scrolling.
//
// Honesty: only the first panel shows data (the real BTC quote, with its own
// live / delayed / stale / unavailable state and update time). The other two
// are labelled examples; a visitor has no account, so nothing is shown as
// running, triggered or profitable. Motion: the connector draws in once when
// the section comes into view; nothing moves with reduced motion.

function ago(iso: string | null | undefined) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}

function MarketPanel() {
  const { assets, error } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  // Shared status rule (lib/marketStatus): old or failed-refresh quotes are stale, never live.
  const st = btc ? effectiveState(btc, error) : null
  const usable = !!btc && st !== null && st !== 'unavailable'
  const label = st === 'live' ? 'Live' : st === 'stale' ? 'Stale' : st === 'delayed' ? 'Delayed' : assets === null && !error ? 'Loading' : 'Unavailable'
  const dot = st === 'live' ? 'bg-emerald-400 board-pulse' : usable ? 'bg-amber-400' : 'bg-fg-faint'
  return (
    <div className="hw-card" data-market-state={st || 'none'}>
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-faint">
        <span>BTC · USD</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}</span>
      </div>
      <p className="mt-2 text-[22px] font-semibold tabular-nums text-fg">{usable ? formatPrice(btc!.price!) : '—'}</p>
      <p className="mt-0.5 text-[12px] tabular-nums text-fg-faint">
        {usable && btc!.changePct != null && <span className={btc!.changePct >= 0 ? 'price-up' : 'price-down'}>{btc!.changePct >= 0 ? '+' : '−'}{Math.abs(btc!.changePct).toFixed(2)}% 24h · </span>}
        {usable ? `Updated ${ago(btc!.updatedAt)}` : 'No current quote — nothing estimated'}
      </p>
    </div>
  )
}

function ExampleTag() { return <span className="shrink-0 rounded-full border border-[rgb(var(--contrast)/.14)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">Example</span> }

function RulePanel() {
  return (
    <div className="hw-card">
      <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] text-fg-faint">Your rule</span><ExampleTag /></div>
      <p className="mt-2 text-[14px] font-semibold text-fg">Notify me if BTC is above a target price</p>
      <p className="mt-1.5 text-[12px] text-fg-muted">Each new quote is checked against the rule.</p>
    </div>
  )
}

function ResultPanel() {
  return (
    <div className="hw-card">
      <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] text-fg-faint">Activity log</span><ExampleTag /></div>
      <ul className="mt-2 space-y-1.5 text-[12.5px]">
        <li className="flex items-center gap-2 text-fg"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />Condition met · notification sent</li>
        <li className="flex items-center gap-2 text-fg-muted"><span className="w-1.5 h-1.5 rounded-full bg-fg-faint shrink-0" aria-hidden="true" />Check recorded · condition not met</li>
      </ul>
    </div>
  )
}

const STEPS: { n: string; title: string; body: string; panel: () => ReactNode }[] = [
  { n: '01', title: 'Market data', body: 'Prices arrive with their own timestamps. Delayed, stale or unavailable quotes say so — nothing is estimated.', panel: () => <MarketPanel /> },
  { n: '02', title: 'Condition evaluation', body: 'Once you are signed in, rules you set for supported markets are checked against new market data about once a minute.', panel: () => <RulePanel /> },
  { n: '03', title: 'Recorded result', body: 'Every check is recorded, and you are notified when a condition is met. Automation notifies you; it does not place trades.', panel: () => <ResultPanel /> },
]

export default function ScrollStory() {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={ref} className="story lp-section border-b border-ink-700" aria-labelledby="story-title" data-story-mode="sequence" data-seen={seen ? '' : undefined}>
      <div className="lp-wrap">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">How Tarafab works</p>
          <h2 id="story-title" className="lp-h2">Intelligent automation for market monitoring</h2>
          <p className="lp-lead">Three steps, from a market quote to a recorded result. Illustration only: automation runs for signed-in clients who set up rules.</p>
        </div>
        <ol className="hw-seq mt-8 lg:mt-10" aria-label="Market data, condition evaluation, recorded result">
          {STEPS.map(s => (
            <li key={s.n} className="hw-step">
              <span className="hw-num" aria-hidden="true">{s.n}</span>
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold text-fg">{s.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">{s.body}</p>
                <div className="mt-3">{s.panel()}</div>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/sign-up" className="btn btn-solid mt-8 inline-flex">Open an account</Link>
      </div>
    </section>
  )
}

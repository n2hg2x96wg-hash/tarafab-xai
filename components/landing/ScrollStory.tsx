'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAssets } from '@/components/markets/assetStore'
import { formatPrice } from '@/lib/assets'
import { effectiveState } from '@/lib/marketStatus'

// "How Tarafab works": four stages, Market data → Analysis → Monitoring →
// Recorded result, joined by one rail. Each stage is a layered glass panel
// that settles from a slight tilt into place as it scrolls into view, and the
// rail fills from stage to stage; while the section is on screen the panels
// lean very slightly with the scroll position. Nothing is stacked on top of
// anything else, so no text ever shows through another panel.
//
// Honesty: only the first panel shows data (the real BTC quote, with its own
// live / delayed / stale / unavailable state and update time). The other
// three are labelled examples; a visitor has no account, so nothing is shown
// as running, triggered or profitable, and the copy says plainly that
// automation notifies and does not trade. Reduced motion: everything is shown
// in place, flat, with no movement.

function ago(iso: string | null | undefined) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}

function ExampleTag() { return <span className="ax-tag">Example</span> }

function PanelHead({ label, aside }: { label: string; aside: ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] text-fg-faint">{label}</span>{aside}</div>
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
    <div className="ax-panel" data-market-state={st || 'none'} data-live={st === 'live' || undefined}>
      <PanelHead label="BTC · USD" aside={<span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-fg-faint"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}</span>} />
      <p className="mt-3 text-[22px] leading-none font-semibold tabular-nums text-fg">{usable ? formatPrice(btc!.price!) : '—'}</p>
      <p className="mt-2 text-[12px] tabular-nums text-fg-faint">
        {usable && btc!.changePct != null && <span className={btc!.changePct >= 0 ? 'price-up' : 'price-down'}>{btc!.changePct >= 0 ? '+' : '−'}{Math.abs(btc!.changePct).toFixed(2)}% 24h · </span>}
        {usable ? `Updated ${ago(btc!.updatedAt)}` : 'No current quote — nothing estimated'}
      </p>
      <p className="ax-foot">Always labelled live, delayed or stale</p>
    </div>
  )
}

function AnalysisPanel() {
  // An illustration of a price series meeting a level the client chose. No
  // figures: it is a picture of the comparison, not a quote.
  return (
    <div className="ax-panel">
      <PanelHead label="Your condition" aside={<ExampleTag />} />
      <p className="mt-2 text-[13.5px] font-semibold text-fg leading-snug">BTC above your target price</p>
      <svg className="ax-chart" viewBox="0 0 220 64" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="24" x2="220" y2="24" className="ax-chart-level" />
        <path d="M0 50 L22 46 L44 49 L66 40 L88 43 L110 34 L132 37 L154 29 L176 26 L198 18 L220 14" className="ax-chart-line" pathLength={1} />
        <circle cx="181" cy="24" r="3.5" className="ax-chart-hit" />
      </svg>
      <p className="ax-foot">Each new quote is compared with your level</p>
    </div>
  )
}

function MonitoringPanel() {
  // A row of checks over time; the last ones lit. Illustrative only.
  return (
    <div className="ax-panel">
      <PanelHead label="Rule checks" aside={<ExampleTag />} />
      <p className="mt-2 text-[13.5px] font-semibold text-fg leading-snug">About once a minute</p>
      <div className="ax-ticks" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ '--j': i } as CSSProperties} className={i >= 11 ? 'is-on' : ''} />)}
      </div>
      <p className="ax-foot">Runs only for rules a signed-in client has switched on</p>
    </div>
  )
}

function ResultPanel() {
  return (
    <div className="ax-panel">
      <PanelHead label="Activity log" aside={<ExampleTag />} />
      <ul className="mt-2.5 space-y-2 text-[12.5px]">
        <li className="flex items-start gap-2 text-fg"><span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />Condition met · notification sent</li>
        <li className="flex items-start gap-2 text-fg-muted"><span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-fg-faint shrink-0" aria-hidden="true" />Check recorded · condition not met</li>
      </ul>
      <p className="ax-foot">Notifies you · never places a trade</p>
    </div>
  )
}

const STEPS: { n: string; title: string; body: string; panel: () => ReactNode }[] = [
  { n: '01', title: 'Market data', body: 'Prices arrive with their own timestamps. Delayed, stale or unavailable quotes say so — nothing is estimated.', panel: () => <MarketPanel /> },
  { n: '02', title: 'Analysis', body: 'Each new quote is compared with the conditions you set, such as a price level or a percentage move.', panel: () => <AnalysisPanel /> },
  { n: '03', title: 'Monitoring', body: 'Once you are signed in, your active rules are checked against new market data about once a minute.', panel: () => <MonitoringPanel /> },
  { n: '04', title: 'Recorded result', body: 'Every check is recorded, and you are notified when a condition is met. Automation notifies you; it does not place trades.', panel: () => <ResultPanel /> },
]

export default function ScrollStory() {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState<boolean[]>(() => STEPS.map(() => false))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-ax-step]'))
    if (typeof IntersectionObserver === 'undefined') { setSeen(STEPS.map(() => true)); return }
    // Each stage settles in once, when it comes into view.
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        const i = Number((e.target as HTMLElement).dataset.axStep)
        setSeen(s => (s[i] ? s : s.map((v, k) => v || k === i)))
        io.unobserve(e.target)
      }
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' })
    items.forEach(n => io.observe(n))
    // While the section is on screen, a very small lean that follows the
    // scroll position (--ax-t, -1 at the bottom of the screen to 1 at the
    // top). Skipped with reduced motion; one rAF per frame at most.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0, onScreen = false
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 1
      const t = Math.max(-1, Math.min(1, ((vh / 2) - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)))
      el.style.setProperty('--ax-t', t.toFixed(3))
    }
    const onScroll = () => { if (onScreen && !raf) raf = requestAnimationFrame(update) }
    const vis = !reduce && new IntersectionObserver(e => { onScreen = e[0].isIntersecting; if (onScreen) onScroll() })
    if (vis) { vis.observe(el); window.addEventListener('scroll', onScroll, { passive: true }) }
    return () => { io.disconnect(); if (vis) { vis.disconnect(); window.removeEventListener('scroll', onScroll) } if (raf) cancelAnimationFrame(raf) }
  }, [])
  return (
    <section ref={ref} className="story lp-section border-b border-ink-700" aria-labelledby="story-title" data-story-mode="sequence" data-seen={seen.every(Boolean) ? '' : undefined}>
      <div className="lp-wrap">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">Automation</p>
          <h2 id="story-title" className="lp-h2">Intelligent automation for market monitoring</h2>
          <p className="lp-lead">Four stages, from a market quote to a recorded result. The quote is real; the other panels are labelled examples, because automation runs only for signed-in clients who set up rules.</p>
        </div>
        <ol className="ax-seq" aria-label="Market data, analysis, monitoring, recorded result">
          {STEPS.map((s, i) => (
            <li key={s.n} className={`ax-step ${seen[i] ? 'is-in' : ''}`} style={{ '--i': i } as CSSProperties} data-ax-step={i}>
              <span className="ax-node" aria-hidden="true">{s.n}</span>
              <h3 className="ax-title">{s.title}</h3>
              <p className="ax-body">{s.body}</p>
              <div className="ax-depth">{s.panel()}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

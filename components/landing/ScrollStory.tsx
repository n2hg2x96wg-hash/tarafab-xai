'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { loadChart, useAssets } from '@/components/markets/useAssets'
import { formatPrice } from '@/lib/assets'
import { effectiveState, type MarketState as EffectiveState } from '@/lib/marketStatus'
import { IconBell, IconChevronDown } from '@/components/Icons'

// "Automation": a short product demonstration in four connected stages,
// Configure a rule → Monitor market data → Evaluate the condition → Record
// and notify, joined by one rail. Each stage is a layered glass panel that
// settles from a slight tilt as it enters the viewport; the rail fills stage
// to stage, and the content of each panel animates in once (a price line
// drawing, the current state lighting up, log rows arriving). Panels never
// stack, so no text shows through another panel.
//
// Honesty, matching the automation engine (supabase/functions/automation-engine):
// - The Bitcoin quote, its freshness and its 24-hour line are real data from
//   the public market endpoints. A missing line is drawn as a labelled
//   illustration, and a quote is never called live unless it is.
// - The rule is an example (its target is placed a little above the real
//   price so the evaluation reads correctly). The engine evaluates live or
//   delayed quotes only and skips stale or unavailable data; stage 3 shows
//   which of those applies right now.
// - The log and the notification are labelled examples. Automation notifies;
//   it does not place trades.
// Reduced motion: everything is shown in place, flat, with no movement.

type Evalu = 'waiting' | 'met' | 'skipped'

function ago(iso: string | null | undefined) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}
const STATE_LABEL: Record<EffectiveState | 'loading', string> = { live: 'Live', delayed: 'Delayed', stale: 'Stale', unavailable: 'Unavailable', loading: 'Loading' }

function Tag({ children = 'Example' }: { children?: string }) { return <span className="ax-tag">{children}</span> }
function Head({ label, aside }: { label: string; aside: React.ReactNode }) {
  return <div className="ax-head"><span>{label}</span>{aside}</div>
}

function ConfigurePanel({ target }: { target: number | null }) {
  return (
    <div className="ax-panel">
      <Head label="New rule" aside={<Tag />} />
      <div className="ax-form" aria-hidden="true">
        <div className="ax-field"><span className="ax-field-k">Market</span><span className="ax-field-v"><span className="ax-coin">₿</span><span className="ax-field-t">Bitcoin · BTC</span><IconChevronDown width={14} height={14} /></span></div>
        <div className="ax-field"><span className="ax-field-k">Condition</span><span className="ax-field-v"><span className="ax-field-t">Price rises above</span><IconChevronDown width={14} height={14} /></span></div>
        <div className="ax-field ax-field-on"><span className="ax-field-k">Target</span><span className="ax-field-v tabular-nums">{target ? formatPrice(target) : 'Your price'}<span className="ax-caret" /></span></div>
      </div>
      <p className="sr-only">Example rule: notify me when Bitcoin rises above {target ? formatPrice(target) : 'a target price'}.</p>
      <p className="ax-foot">Rules run only for signed-in clients who switch them on</p>
    </div>
  )
}

function MonitorPanel({ price, state, updatedAt, change, points, target }: { price: number | null; state: EffectiveState | 'loading'; updatedAt?: string | null; change?: number | null; points: [number, number][] | null; target: number | null }) {
  const usable = price != null && state !== 'unavailable' && state !== 'loading'
  // The real 24-hour line when it loaded; otherwise a plain illustrative curve.
  const real = !!points && points.length > 4
  const path = useMemo(() => {
    const W = 220, H = 64, pad = 6
    if (!real) return { d: 'M0 50 L22 46 L44 49 L66 40 L88 43 L110 34 L132 37 L154 31 L176 33 L198 26 L220 22', level: 14 }
    const vals = points!.map(p => p[1])
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (target) hi = Math.max(hi, target)
    if (hi - lo < 1e-9) { hi += 1; lo -= 1 }
    const y = (v: number) => pad + (H - 2 * pad) * (1 - (v - lo) / (hi - lo))
    const step = W / (points!.length - 1)
    return { d: points!.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' '), level: target ? y(target) : null }
  }, [real, points, target])
  const dot = state === 'live' ? 'bg-emerald-400 board-pulse' : usable ? 'bg-amber-400' : 'bg-fg-faint'
  return (
    <div className="ax-panel" data-market-state={state} data-live={state === 'live' || undefined}>
      <Head label="BTC · USD" aside={<span className="ax-state"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />{STATE_LABEL[state]}</span>} />
      <p className="mt-2 text-[21px] leading-none font-semibold tabular-nums text-fg">{usable ? formatPrice(price!) : '—'}</p>
      <p className="mt-1.5 text-[11.5px] tabular-nums text-fg-faint">
        {usable && change != null && <span className={change >= 0 ? 'price-up' : 'price-down'}>{change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(2)}% 24h · </span>}
        {usable ? `Updated ${ago(updatedAt)}` : state === 'loading' ? 'Fetching the latest quote' : 'No current quote — nothing estimated'}
      </p>
      <div className="ax-line">
        <svg viewBox="0 0 220 64" preserveAspectRatio="none" aria-hidden="true">
          {path.level != null && <line x1="0" x2="220" y1={path.level} y2={path.level} className="ax-line-target" />}
          <path d={path.d} className={`ax-line-path ${real ? '' : 'is-illustrative'}`} pathLength={1} />
        </svg>
        <span className="ax-line-cap">{real ? '24 h · dashed line: example target' : <>Illustrative line <Tag>Illustration</Tag></>}</span>
      </div>
    </div>
  )
}

function EvaluatePanel({ ev, price, target, state }: { ev: Evalu | null; price: number | null; target: number | null; state: EffectiveState | 'loading' }) {
  const rows: [Evalu, string, string][] = [
    ['waiting', 'Waiting', 'Price is below the target'],
    ['met', 'Condition met', 'Price reached the target'],
    ['skipped', 'Not evaluated', 'Quote stale or unavailable'],
  ]
  return (
    <div className="ax-panel">
      <Head label="Evaluation" aside={<span className="ax-state">Right now</span>} />
      <ul className="ax-eval" role="list">
        {rows.map(([k, t, d]) => (
          <li key={k} className={`ax-eval-row ax-eval-${k} ${ev === k ? 'is-current' : ''}`} aria-current={ev === k ? 'true' : undefined}>
            <span className="ax-eval-dot" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-fg">{t}</span><span className="block text-[11.5px] text-fg-faint">{d}</span></span>
          </li>
        ))}
      </ul>
      <p className="ax-foot tabular-nums">
        {ev === null ? 'Waiting for a quote' : ev === 'skipped' ? `${STATE_LABEL[state]} quote — this check would be skipped` : `${formatPrice(price!)} against the example target ${formatPrice(target!)}`}
      </p>
    </div>
  )
}

function NotifyPanel({ target }: { target: number | null }) {
  return (
    <div className="ax-panel">
      <Head label="Activity log" aside={<Tag />} />
      <div className="ax-note">
        <span className="ax-note-icon" aria-hidden="true"><IconBell width={14} height={14} /></span>
        <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-fg">Bitcoin rose above {target ? formatPrice(target) : 'your target'}</span><span className="block text-[11.5px] text-fg-faint">Notification · sent once</span></span>
      </div>
      <ul className="ax-log" role="list">
        <li style={{ '--k': 0 } as CSSProperties}><span className="bg-accent" />Condition met · notification sent</li>
        <li style={{ '--k': 1 } as CSSProperties}><span className="bg-fg-faint" />Check recorded · condition not met</li>
        <li style={{ '--k': 2 } as CSSProperties}><span className="bg-fg-faint/50" />Check skipped · quote stale</li>
      </ul>
    </div>
  )
}

const STEPS = [
  { n: '01', title: 'Configure a rule', body: 'Choose a supported market, a condition and your target value.' },
  { n: '02', title: 'Monitor market data', body: 'New quotes arrive with their own timestamp and freshness label.' },
  { n: '03', title: 'Evaluate the condition', body: 'About once a minute, on live or delayed quotes only.' },
  { n: '04', title: 'Record and notify', body: 'Every check is logged; you are notified once when it is met.' },
]

export default function ScrollStory() {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState<boolean[]>(() => STEPS.map(() => false))
  const { assets, error } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  // Shared status rule (lib/marketStatus): old or failed-refresh quotes are stale, never live.
  const state: EffectiveState | 'loading' = btc ? effectiveState(btc, error) : assets === null && !error ? 'loading' : 'unavailable'
  const price = btc?.price ?? null
  const usable = price != null && (state === 'live' || state === 'delayed' || state === 'stale')
  // Example target: a round price a little above the current quote.
  const target = usable ? Math.ceil((price! * 1.03) / 500) * 500 : null
  const ev: Evalu | null = state === 'loading' ? null : state === 'live' || state === 'delayed' ? (price! >= target! ? 'met' : 'waiting') : 'skipped'

  // The real 24-hour line, fetched once the monitoring stage comes into view.
  const [points, setPoints] = useState<[number, number][] | null>(null)
  useEffect(() => {
    if (!seen[1]) return
    const ac = new AbortController()
    loadChart('BTC', '1D', ac.signal).then(c => { if (c.available) setPoints(c.points as [number, number][]) }).catch(() => { /* drawn as an illustration */ })
    return () => ac.abort()
  }, [seen[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(STEPS.map(() => true)); return }
    // Each stage animates in once, when it comes into view.
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        const i = Number((e.target as HTMLElement).dataset.axStep)
        setSeen(s => (s[i] ? s : s.map((v, k) => v || k === i)))
        io.unobserve(e.target)
      }
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' })
    el.querySelectorAll<HTMLElement>('[data-ax-step]').forEach(n => io.observe(n))
    // While on screen, a very small lean that follows the scroll position
    // (--ax-t from -1 to 1). Skipped with reduced motion; one rAF per frame.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0, onScreen = false
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 1
      el.style.setProperty('--ax-t', Math.max(-1, Math.min(1, ((vh / 2) - (r.top + r.height / 2)) / (vh / 2 + r.height / 2))).toFixed(3))
    }
    const onScroll = () => { if (onScreen && !raf) raf = requestAnimationFrame(update) }
    const vis = !reduce && new IntersectionObserver(e => { onScreen = e[0].isIntersecting; if (onScreen) onScroll() })
    if (vis) { vis.observe(el); window.addEventListener('scroll', onScroll, { passive: true }) }
    return () => { io.disconnect(); if (vis) { vis.disconnect(); window.removeEventListener('scroll', onScroll) } if (raf) cancelAnimationFrame(raf) }
  }, [])

  const panels = [
    <ConfigurePanel key="c" target={target} />,
    <MonitorPanel key="m" price={price} state={state} updatedAt={btc?.updatedAt} change={btc?.changePct} points={points} target={target} />,
    <EvaluatePanel key="e" ev={ev} price={price} target={target} state={state} />,
    <NotifyPanel key="n" target={target} />,
  ]
  return (
    <section ref={ref} className="story lp-section ax-section border-b border-ink-700" aria-labelledby="story-title" data-story-mode="sequence" data-chat-avoid data-seen={seen.every(Boolean) ? '' : undefined} data-eval={ev || 'none'}>
      <div className="lp-wrap">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">Automation</p>
          <h2 id="story-title" className="lp-h2">Intelligent automation for market monitoring</h2>
          <p className="lp-lead">Set a rule once and Tarafab watches the market for you. Automation monitors conditions and sends notifications; it does not place trades.</p>
          <p className="ax-legend"><Tag /> marks an illustration. The Bitcoin quote and its freshness are real.</p>
        </div>
        <ol className="ax-seq" aria-label="Configure a rule, monitor market data, evaluate the condition, record and notify">
          {STEPS.map((s, i) => (
            <li key={s.n} className={`ax-step ${seen[i] ? 'is-in' : ''}`} style={{ '--i': i } as CSSProperties} data-ax-step={i}>
              <span className="ax-node" aria-hidden="true">{s.n}</span>
              <h3 className="ax-title">{s.title}</h3>
              <p className="ax-body">{s.body}</p>
              <div className="ax-depth">{panels[i]}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

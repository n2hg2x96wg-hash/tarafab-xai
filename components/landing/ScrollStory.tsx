'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAssets } from '@/components/markets/assetStore'
import { formatPrice } from '@/lib/assets'
import { effectiveState } from '@/lib/marketStatus'
import { useEngineStatus } from '@/lib/engineStatus'

// Scroll-driven 3D story for the landing page.
//
// Performance: one passive scroll listener, attached only while the section is
// on screen (IntersectionObserver), throttled to requestAnimationFrame. It
// writes a single CSS variable (--p, 0..1); every 3D transform is computed by
// CSS from it, so React does not re-render per frame and only transform /
// opacity change (GPU-composited). Three tiers:
//   full   – wide screen, capable device: sticky stage with a 3D scene;
//   lite   – phones / low-power devices: stacked cards, one reveal each;
//   static – prefers-reduced-motion: no motion at all.
// Honesty: only the market layer shows data (the real BTC quote, pulsing only
// when the feed is live). The other layers are labelled examples: a visitor
// has no account, so nothing is shown as running, completed or profitable.

type Mode = 'full' | 'lite' | 'static'
// Decided on the first render (this section only ever renders in the browser,
// via LazyOnView), so its height is final when it mounts — no later jump.
function pickMode(): Mode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'lite'
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static'
  // The 3D scene is transform/opacity only, so phones get it too (a smaller,
  // stacked layout). Devices that ask to save data or report very few cores
  // get the lighter stacked cards instead.
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return 'lite'
  if ((nav.hardwareConcurrency || 8) < 4 && (nav.deviceMemory ?? 8) < 4) return 'lite'
  return 'full'
}
function useMode(): Mode {
  const [m, setM] = useState<Mode>(pickMode)
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
        const decide = () => setM(pickMode())
    decide()
    rm.addEventListener?.('change', decide)
    return () => { rm.removeEventListener?.('change', decide) }
  }, [])
  return m
}

const STEPS: { eyebrow: string; title: string; body: string }[] = [
  { eyebrow: 'Market data', title: 'Real market information.', body: 'Prices arrive with their own timestamps. Delayed or unavailable quotes say so — nothing is estimated.' },
  { eyebrow: 'Analysis', title: 'Conditions, evaluated.', body: 'Configure rules that watch supported markets — a price level, a move over 24 hours. Each new quote is checked against them.' },
  { eyebrow: 'Automation', title: 'An automation layer that keeps watch.', body: 'The engine evaluates your rules every minute and records activity for review, even when you are signed out.' },
  { eyebrow: 'Monitoring', title: 'Follow each investment.', body: 'Track every investment from request to active to completed, with each return recorded against it.' },
  { eyebrow: 'Portfolio', title: 'Review your portfolio.', body: 'Balances, investments and recorded performance in one place, with an audit trail behind every change.' },
]

function MarketLayer() {
  const { assets, error } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  // Shared status rule (lib/marketStatus): old or failed-refresh quotes are stale, never live.
  const st = btc ? effectiveState(btc, error) : null
  const usable = !!btc && st !== null && st !== 'unavailable'
  const live = st === 'live'
  return (
    <div className="story-card" data-live={live ? 'true' : 'false'}>
      <div className="flex items-center justify-between text-[11px] text-fg-faint">
        <span>BTC · USD</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 board-pulse' : usable ? 'bg-amber-400' : 'bg-fg-faint'}`} aria-hidden="true" />{live ? 'Live' : st === 'stale' ? 'Stale' : usable ? 'Delayed' : assets === null && !error ? 'Loading' : 'Unavailable'}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{usable ? formatPrice(btc!.price!) : '—'}</p>
      {usable && btc!.changePct != null
        ? <p className={`text-[12px] tabular-nums ${btc!.changePct >= 0 ? 'price-up' : 'price-down'}`}>{btc!.changePct >= 0 ? '+' : '−'}{Math.abs(btc!.changePct).toFixed(2)}% · 24h</p>
        : <p className="text-[12px] text-fg-faint">{usable ? '' : 'No current quote — nothing estimated'}</p>}
    </div>
  )
}

function ExampleTag() { return <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">Example</span> }

function AnalysisLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">Rule evaluation</span><ExampleTag /></div>
      <p className="mt-2 text-[14px] font-semibold text-fg">BTC price above target</p>
      <ol className="mt-3 flex items-center gap-1.5 text-[10.5px] text-fg-faint" aria-label="New quote, condition checked, result recorded">
        {['New quote', 'Condition checked', 'Result recorded'].map((x, i) => (
          <li key={x} className="story-step flex items-center gap-1.5" style={{ ['--d' as string]: i }}><span className="rounded-md border border-ink-600 px-1.5 py-1">{x}</span>{i < 2 && <span className="h-px w-3 bg-accent/50" aria-hidden="true" />}</li>
        ))}
      </ol>
    </div>
  )
}

// Real engine status (verified heartbeat); 'Running' only when the database
// confirms a recent successful run.
function EngineLayer() {
  const { state, status, presentation } = useEngineStatus()
  const running = state === 'running'
  return (
    <div className="story-card" data-live={running ? 'true' : 'false'}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-fg-faint truncate">{presentation.display_name}</span>
        <span className="inline-flex items-center gap-1.5 text-fg-muted"><span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400 board-pulse' : 'bg-fg-faint'}`} aria-hidden="true" />{running ? 'Running' : state === 'degraded' ? 'Delayed' : state === 'offline' ? 'Offline' : 'Unavailable'}</span>
      </div>
      <p className="mt-2 text-[13px] text-fg">Monitoring {status && status.monitored_count ? status.monitored.slice(0, 3).join(' · ') + (status.monitored_count > 3 ? ` +${status.monitored_count - 3}` : '') : presentation.asset_labels}</p>
      <p className="mt-2 text-[11px] text-fg-faint">Automation does not guarantee investment returns.</p>
    </div>
  )
}

function TrackLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">Investment lifecycle</span><ExampleTag /></div>
      <div className="story-life mt-4" aria-label="Requested, active, completed">
        <div className="story-life-track"><span /></div>
        <ol className="mt-2 grid grid-cols-3 text-[11px] text-center">
          {[['Requested', 'text-sky-300'], ['Active', 'text-emerald-300'], ['Completed', 'text-accent']].map(([s, c]) => <li key={s} className={c}>{s}</li>)}
        </ol>
      </div>
      <p className="mt-3 text-[11px] text-fg-faint">Returns are recorded as they are credited — never projected as guaranteed.</p>
    </div>
  )
}

function PortfolioLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">Your portfolio</span><ExampleTag /></div>
      <ul className="mt-3 space-y-1.5 text-[12px] text-fg-muted">
        {['Account balance', 'Total invested', 'Recorded performance'].map((x, i) => (
          <li key={x} className="flex items-center justify-between gap-3"><span>{x}</span><span className="h-2 rounded bg-ink-700" style={{ width: `${58 - i * 12}px` }} aria-hidden="true" /></li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-fg-faint">Your real figures appear after sign-in.</p>
    </div>
  )
}

const LAYERS: (() => ReactNode)[] = [() => <MarketLayer />, () => <AnalysisLayer />, () => <EngineLayer />, () => <TrackLayer />, () => <PortfolioLayer />]

export default function ScrollStory() {
  const mode = useMode()
  // Phones scroll through the same four stages in less distance.
  const [narrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches)
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef(0)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (mode !== 'full') return
    const el = sectionRef.current, stage = stageRef.current
    if (!el || !stage) return
    let raf = 0, listening = false
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const total = Math.max(1, r.height - window.innerHeight)
      const p = Math.min(1, Math.max(0, -r.top / total))
      stage.style.setProperty('--p', p.toFixed(4))
      const s = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.9999))
      if (s !== stepRef.current) { stepRef.current = s; setStep(s) }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const io = new IntersectionObserver(e => {
      const on = e[0].isIntersecting
      if (on && !listening) { window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll, { passive: true }); listening = true; update() }
      if (!on && listening) { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); listening = false }
    })
    io.observe(el)
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [mode])

  // Lite / static: stacked cards, revealed once each (no scroll listener).
  if (mode !== 'full') {
    return (
      <section className="story story-lite border-b border-ink-700" aria-labelledby="story-title" data-story-mode={mode}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">How Tarafab works</p>
          <h2 id="story-title" className="mt-3 text-3xl font-semibold tracking-tight text-fg">Intelligent automation for market monitoring and portfolio management</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s, i) => <LiteStep key={s.title} i={i} s={s} motion={mode === 'lite'}>{LAYERS[i]()}</LiteStep>)}
          </ol>
          <Link href="/sign-up" className="btn btn-solid mt-8 inline-flex">Open an account</Link>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} className="story story-full border-b border-ink-700 relative" style={{ height: `${narrow ? STEPS.length * 62 + 38 : STEPS.length * 80 + 40}vh` }} aria-labelledby="story-title" data-story-mode="full">
      <div className="sticky top-16 h-[calc(100vh-4rem)] h-[calc(100svh-4rem)] overflow-hidden">
        {/* Phones: scene on top, the current step below; from lg: side by side. */}
        <div className="max-w-6xl h-full mx-auto px-4 sm:px-6 grid grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-1 lg:grid-cols-[1fr_1.1fr] gap-3 lg:gap-10 items-center py-4 lg:py-0">
          <div className="order-2 lg:order-none min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">How Tarafab works</p>
            <h2 id="story-title" className="mt-2 lg:mt-3 text-[22px] sm:text-[26px] lg:text-[34px] leading-tight font-semibold tracking-tight text-fg">Intelligent automation for market monitoring and portfolio management</h2>
            <ol className="mt-3 lg:mt-8 space-y-3" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className={`story-text ${i === step ? 'is-active' : 'max-lg:hidden'}`} aria-current={i === step ? 'step' : undefined}>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-fg-faint">{String(i + 1).padStart(2, '0')} · {s.eyebrow}</p>
                  <p className="mt-1 text-[18px] font-semibold text-fg">{s.title}</p>
                  <p className="story-body mt-1 text-[14px] text-fg-muted leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
            <Link href="/sign-up" className="btn btn-solid mt-4 lg:mt-8 inline-flex">Open an account</Link>
          </div>
          <div ref={stageRef} className="story-stage order-1 lg:order-none min-h-0" data-step={step} aria-hidden="true">
            <div className="story-plane" />
            <div className="story-orbit">
              {LAYERS.map((L, i) => <div key={i} className={`story-layer ${i === step ? 'is-active' : i < step ? 'is-past' : ''}`} style={{ ['--i' as string]: i }}>{L()}</div>)}
            </div>
            {/* Data points drifting at different depths with scroll progress. */}
            <span className="story-pt" style={{ ['--x' as string]: '12%', ['--y' as string]: '22%', ['--z' as string]: '-60px' }} />
            <span className="story-pt" style={{ ['--x' as string]: '86%', ['--y' as string]: '30%', ['--z' as string]: '-120px' }} />
            <span className="story-pt" style={{ ['--x' as string]: '74%', ['--y' as string]: '64%', ['--z' as string]: '20px' }} />
            {/* The four stages, connected; the track fills as the visitor scrolls. */}
            <div className="story-rail">
              <div className="story-track"><span /></div>
              {STEPS.map((s, i) => <span key={s.eyebrow} className={`story-node ${i <= step ? 'is-on' : ''} ${i === step ? 'is-now' : ''}`} style={{ ['--k' as string]: i / (STEPS.length - 1) }}><i>{s.eyebrow}</i></span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function LiteStep({ i, s, motion, children }: { i: number; s: { eyebrow: string; title: string; body: string }; motion: boolean; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null)
  const [shown, setShown] = useState(!motion)
  useEffect(() => {
    if (!motion) return
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el); return () => io.disconnect()
  }, [motion])
  return (
    <li ref={ref} className={`story-lite-step panel p-4 ${shown ? 'is-in' : ''}`} style={{ ['--i' as string]: i % 2 }}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-fg-faint">{String(i + 1).padStart(2, '0')} · {s.eyebrow}</p>
      <p className="mt-1 text-[17px] font-semibold text-fg">{s.title}</p>
      <p className="mt-1 text-[14px] text-fg-muted leading-relaxed">{s.body}</p>
      <div className="mt-4">{children}</div>
    </li>
  )
}

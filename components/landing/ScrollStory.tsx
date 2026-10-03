'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAssets } from '@/components/markets/assetStore'
import { formatPrice } from '@/lib/assets'

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
  { eyebrow: 'Market data', title: 'Real quotes, clearly labelled', body: 'Prices come from the market feed with their own timestamps. When a quote is delayed or unavailable, it says so — nothing is estimated.' },
  { eyebrow: 'Automation', title: 'Rules that watch the market for you', body: 'Set a condition such as “BTC above a price”. The server checks it every minute and notifies you only when the market actually meets it.' },
  { eyebrow: 'Portfolio', title: 'Every balance, one view', body: 'Account, invested and profit balances with the history behind each change — your real figures appear after you sign in.' },
  { eyebrow: 'Review & security', title: 'Every deposit and withdrawal reviewed', body: 'Funds move only after verification. Each step is recorded in an audit trail you can follow from your dashboard.' },
]

function MarketLayer() {
  const { assets, error } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  const usable = !!btc && btc.price != null && (btc.state === 'live' || btc.state === 'delayed') && !error
  const live = usable && btc!.state === 'live'
  return (
    <div className="story-card" data-live={live ? 'true' : 'false'}>
      <div className="flex items-center justify-between text-[11px] text-fg-faint">
        <span>BTC · USD</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 board-pulse' : usable ? 'bg-amber-400' : 'bg-fg-faint'}`} aria-hidden="true" />{live ? 'Live' : usable ? 'Delayed' : assets === null && !error ? 'Loading' : 'Unavailable'}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{usable ? formatPrice(btc!.price!) : '—'}</p>
      {usable && btc!.changePct != null
        ? <p className={`text-[12px] tabular-nums ${btc!.changePct >= 0 ? 'price-up' : 'price-down'}`}>{btc!.changePct >= 0 ? '+' : '−'}{Math.abs(btc!.changePct).toFixed(2)}% · 24h</p>
        : <p className="text-[12px] text-fg-faint">{usable ? '' : 'No current quote — nothing estimated'}</p>}
    </div>
  )
}

function ExampleTag() { return <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">Example</span> }

function AutomationLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">Automation rule</span><ExampleTag /></div>
      <p className="mt-2 text-[15px] font-semibold text-fg">BTC price above target</p>
      <ol className="mt-3 flex items-center gap-1.5 text-[10px] text-fg-faint" aria-label="Rule steps: condition, checked every minute, notification">
        {['Condition', 'Checked each minute', 'Notify'].map((s, i) => (
          <li key={s} className="flex items-center gap-1.5"><span className="rounded-md border border-ink-600 px-1.5 py-1">{s}</span>{i < 2 && <span className="h-px w-3 bg-ink-600" aria-hidden="true" />}</li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-fg-faint">Not running — create rules in your dashboard.</p>
    </div>
  )
}

function PortfolioLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">Portfolio</span><ExampleTag /></div>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 42 42" className="w-16 h-16 shrink-0" aria-hidden="true">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="rgb(var(--ink-600))" strokeWidth="5" />
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="rgb(var(--accent))" strokeOpacity=".7" strokeWidth="5" strokeDasharray="38 62" strokeDashoffset="25" />
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="rgb(52 211 153)" strokeOpacity=".6" strokeWidth="5" strokeDasharray="22 78" strokeDashoffset="-13" />
        </svg>
        <ul className="space-y-1 text-[12px] text-fg-muted">
          <li>Account balance</li><li>Invested</li><li>Profit balance</li>
        </ul>
      </div>
      <p className="mt-2 text-[11px] text-fg-faint">Layout only — your figures appear after sign-in.</p>
    </div>
  )
}

function ReviewLayer() {
  return (
    <div className="story-card">
      <div className="flex items-center justify-between"><span className="text-[11px] text-fg-faint">How a deposit progresses</span><ExampleTag /></div>
      <ol className="mt-3 space-y-1.5 text-[12px]">
        {[['Submitted', 'bg-sky-400'], ['Under review', 'bg-amber-400'], ['Approved & credited', 'bg-emerald-400']].map(([s, c]) => (
          <li key={s} className="flex items-center gap-2 text-fg-muted"><span className={`w-1.5 h-1.5 rounded-full ${c}`} aria-hidden="true" />{s}</li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-fg-faint">Each step is recorded in the audit trail.</p>
    </div>
  )
}

const LAYERS: (() => ReactNode)[] = [() => <MarketLayer />, () => <AutomationLayer />, () => <PortfolioLayer />, () => <ReviewLayer />]

export default function ScrollStory() {
  const mode = useMode()
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
          <h2 id="story-title" className="mt-3 text-3xl font-semibold tracking-tight text-fg">From market data to a reviewed balance</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s, i) => <LiteStep key={s.title} i={i} s={s} motion={mode === 'lite'}>{LAYERS[i]()}</LiteStep>)}
          </ol>
          <Link href="/sign-up" className="btn btn-solid mt-8 inline-flex">Open an account</Link>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} className="story story-full border-b border-ink-700 relative" style={{ height: `${STEPS.length * 80 + 40}vh` }} aria-labelledby="story-title" data-story-mode="full">
      <div className="sticky top-16 h-[calc(100vh-4rem)] h-[calc(100svh-4rem)] overflow-hidden">
        {/* Phones: scene on top, the current step below; from lg: side by side. */}
        <div className="max-w-6xl h-full mx-auto px-4 sm:px-6 grid grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-1 lg:grid-cols-[1fr_1.1fr] gap-3 lg:gap-10 items-center py-4 lg:py-0">
          <div className="order-2 lg:order-none min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">How Tarafab works</p>
            <h2 id="story-title" className="mt-2 lg:mt-3 text-[22px] sm:text-[26px] lg:text-[34px] leading-tight font-semibold tracking-tight text-fg">From market data to a reviewed balance</h2>
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
          <div ref={stageRef} className="story-stage order-1 lg:order-none min-h-0 h-full lg:h-auto" data-step={step} aria-hidden="true">
            <div className="story-plane" />
            <div className="story-orbit">
              {LAYERS.map((L, i) => <div key={i} className={`story-layer ${i === step ? 'is-active' : i < step ? 'is-past' : ''}`} style={{ ['--i' as string]: i }}>{L()}</div>)}
            </div>
            <div className="story-progress"><span /></div>
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

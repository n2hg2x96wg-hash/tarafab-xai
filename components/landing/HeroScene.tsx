'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { BtcQuote } from '@/components/markets/assetStore'
import { ageLabel } from '@/lib/marketStatus'

// The hero's 3D visual: one real market node (BTC/USD from the shared quote)
// connected to the three things the platform does with market data. It is
// the only number in the hero.
//
// Depth comes from CSS 3D transforms driven by two variables set here
// without React re-renders: --tx/--ty (pointer tilt, fine pointers only) and
// --hp (scroll progress through the hero). Listeners are rAF-throttled and
// attached only while the hero is on screen; reduced motion gets a still,
// flat composition. The price and its label come from the same snapshot and
// status rule as the ticker and the market board (useBtcQuote): Live only
// while the quote is fresh, otherwise Delayed or Stale with its age; no price
// is shown when there is none.

const NODES = [
  { key: 'landing.scene.intelligence', cls: 'hs-n1' },
  { key: 'landing.scene.automation', cls: 'hs-n2' },
  { key: 'landing.scene.investments', cls: 'hs-n3' },
] as const

export default function HeroScene({ quote, compact = false }: { quote: BtcQuote; compact?: boolean }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const fine = window.matchMedia('(pointer: fine)').matches
    let raf = 0, px = 0, py = 0
    const frame = () => {
      raf = 0
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 1
      el.style.setProperty('--hp', Math.min(1, Math.max(0, -r.top / (r.height + vh * 0.25))).toFixed(3))
      el.style.setProperty('--tx', px.toFixed(3)); el.style.setProperty('--ty', py.toFixed(3))
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame) }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
      py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      kick()
    }
    const onLeave = () => { px = 0; py = 0; kick() }
    let on = false
    const attach = (v: boolean) => {
      if (v === on) return; on = v
      const f = v ? 'addEventListener' : 'removeEventListener'
      window[f]('scroll', kick, { passive: true } as AddEventListenerOptions)
      if (fine) { window[f]('pointermove', onMove as EventListener, { passive: true } as AddEventListenerOptions); el[f]('pointerleave', onLeave) }
      if (v) kick()
    }
    const io = new IntersectionObserver(e => { el.toggleAttribute('data-vis', e[0].isIntersecting); attach(e[0].isIntersecting) })
    io.observe(el)
    return () => { io.disconnect(); attach(false); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const st = quote.state
  const hasPrice = quote.price != null && Number.isFinite(quote.price) && st !== 'unavailable' && st !== 'loading'
  const change = hasPrice ? quote.changePct : null
  const age = st === 'live' ? '' : ageLabel(quote.updatedAt)
  const label = st === 'live' ? t('status.live') : st === 'delayed' ? t('status.delayed') : st === 'stale' ? t('status.stale')
    : st === 'loading' ? t('status.connecting') : t('common.unavailable')
  const tone = st === 'live' ? 'bg-emerald-400' : st === 'loading' ? 'bg-fg-faint' : 'bg-amber-400'

  const card = (
    <div className={compact ? 'hs-card' : 'hs-main'} role="group" aria-label={t('landing.scene.aria')}>
      <div className="flex items-center justify-between gap-3 text-[12px] text-fg-muted">
        <span>Bitcoin <span className="text-fg-faint">BTC/USD</span></span>
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
          <span className={`w-1.5 h-1.5 rounded-full ${tone} ${st === 'live' ? 'board-pulse' : ''}`} aria-hidden="true" />{label}
          {hasPrice && age ? <span className="normal-case tracking-normal text-fg-faint" title={quote.updatedAt || undefined}>· {age}</span> : null}
        </span>
      </div>
      <p className="mt-2 text-[30px] sm:text-[34px] leading-none font-semibold tracking-tight tabular-nums text-fg" data-hero-price>
        {hasPrice ? `$${quote.price!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </p>
      <p className="mt-2 h-4 text-[12px] tabular-nums">
        {change != null ? <span className={change >= 0 ? 'price-up' : 'price-down'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% <span className="text-fg-faint">24h</span></span>
          : !hasPrice && st === 'unavailable' ? <span className="text-fg-faint">{t('landing.scene.noQuote')}</span> : null}
      </p>
    </div>
  )
  // Compact: only the live price card (the hero's 3D coin stands above it).
  if (compact) return <div className="hero-scene-compact" data-scene-status={st} data-quote-at={quote.updatedAt || ''}>{card}</div>

  return (
    <div ref={ref} className="hero-scene" data-scene-status={st} data-quote-at={quote.updatedAt || ''}>
      <div className="hs-floor" aria-hidden="true" />
      <div className="hs-rig">
        <svg className="hs-links" viewBox="0 0 400 320" preserveAspectRatio="none" aria-hidden="true">
          <path d="M200 120 C 140 170, 90 190, 70 250" pathLength={100} />
          <path d="M200 120 C 200 180, 200 210, 200 270" pathLength={100} />
          <path d="M200 120 C 260 170, 310 190, 330 250" pathLength={100} />
        </svg>
        {card}
        {NODES.map(n => (
          <div key={n.key} className={`hs-node ${n.cls}`} aria-hidden="true"><span className="hs-dot" />{t(n.key)}</div>
        ))}
      </div>
    </div>
  )
}

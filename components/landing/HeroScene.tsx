'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { useLiveMarket } from '@/components/LiveCrypto'

// The hero's 3D visual: one real market node (BTC/USD from the live feed)
// connected to the three things the platform does with market data. It is
// the only number in the hero.
//
// Depth comes from CSS 3D transforms driven by two variables set here
// without React re-renders: --tx/--ty (pointer tilt, fine pointers only) and
// --hp (scroll progress through the hero). Listeners are rAF-throttled and
// attached only while the hero is on screen; reduced motion gets a still,
// flat composition. The price is shown only when the feed actually has one;
// the label says Live only while the stream is live.
type Market = ReturnType<typeof useLiveMarket>

const NODES = [
  { key: 'landing.scene.intelligence', cls: 'hs-n1' },
  { key: 'landing.scene.automation', cls: 'hs-n2' },
  { key: 'landing.scene.investments', cls: 'hs-n3' },
] as const

export default function HeroScene({ market }: { market: Market }) {
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

  const btc = market.quotes['BTC-USD']
  const hasPrice = !!btc && Number.isFinite(btc.price) && (market.status === 'live' || market.status === 'polling')
  const change = hasPrice && btc!.open24h ? (btc!.price / btc!.open24h - 1) * 100 : null
  const label = market.status === 'live' ? t('status.live') : market.status === 'polling' ? t('status.current')
    : market.status === 'connecting' ? t('status.connecting') : t('common.unavailable')
  const tone = market.status === 'live' || market.status === 'polling' ? 'bg-emerald-400' : market.status === 'connecting' ? 'bg-fg-faint' : 'bg-amber-400'

  return (
    <div ref={ref} className="hero-scene" data-scene-status={market.status}>
      <div className="hs-floor" aria-hidden="true" />
      <div className="hs-rig">
        <svg className="hs-links" viewBox="0 0 400 320" preserveAspectRatio="none" aria-hidden="true">
          <path d="M200 120 C 140 170, 90 190, 70 250" pathLength={100} />
          <path d="M200 120 C 200 180, 200 210, 200 270" pathLength={100} />
          <path d="M200 120 C 260 170, 310 190, 330 250" pathLength={100} />
        </svg>
        <div className="hs-main" role="group" aria-label={t('landing.scene.aria')}>
          <div className="flex items-center justify-between gap-3 text-[12px] text-fg-muted">
            <span>Bitcoin <span className="text-fg-faint">BTC/USD</span></span>
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
              <span className={`w-1.5 h-1.5 rounded-full ${tone} ${market.status === 'live' ? 'board-pulse' : ''}`} aria-hidden="true" />{label}
            </span>
          </div>
          <p className="mt-2 text-[30px] sm:text-[34px] leading-none font-semibold tracking-tight tabular-nums text-fg" data-hero-price>
            {hasPrice ? `$${btc!.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </p>
          <p className="mt-2 h-4 text-[12px] tabular-nums">
            {change != null ? <span className={change >= 0 ? 'price-up' : 'price-down'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% <span className="text-fg-faint">24h</span></span>
              : !hasPrice && market.status === 'error' ? <span className="text-fg-faint">{t('landing.scene.noQuote')}</span> : null}
          </p>
        </div>
        {NODES.map(n => (
          <div key={n.key} className={`hs-node ${n.cls}`} aria-hidden="true"><span className="hs-dot" />{t(n.key)}</div>
        ))}
      </div>
    </div>
  )
}

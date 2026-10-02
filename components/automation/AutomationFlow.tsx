'use client'

import { useEffect, useRef, useState } from 'react'
import type { AssetQuote } from '@/lib/assets'
import { formatPrice } from '@/lib/assets'
import { StatusIndicator, type Tone } from '@/components/ui/State'

// Visual representation of one automation, built only from real state:
// the asset's recorded quote (market_quotes via /api/market/assets) and the
// rule's own row (status, last evaluation, trigger). The same component is
// used for every asset. It never animates something as working when the
// data says it is not: flowing connectors appear only between stages that
// are actually live, and nothing is marked triggered unless the engine
// recorded a trigger.

export type FlowAuto = {
  kind: 'price_above' | 'price_below' | 'pct_up' | 'pct_down' | 'move_abs'; target: number
  status: 'active' | 'paused' | 'triggered' | 'failed'
  last_evaluated_at: string | null; last_error: string | null; triggered_at: string | null; trigger_price: number | null
}
type StageState = 'ok' | 'waiting' | 'done' | 'error' | 'off' | 'neutral'
type Stage = { key: string; title: string; value: string; note?: string; state: StageState }

export type FlowText = (key: string, vars?: Record<string, string | number>) => string
const EVAL_FRESH_MIN = 3 // the engine runs every minute

const isPct = (k: FlowAuto['kind']) => k === 'pct_up' || k === 'pct_down' || k === 'move_abs'

// Overall state shown to the user, from backend state only.
export function flowStatus(a: FlowAuto | null, q: AssetQuote | null): { tone: Tone; key: string } {
  if (!a) return { tone: 'neutral', key: 'flow.st.none' }
  if (a.status === 'failed') return { tone: 'error', key: 'flow.st.error' }
  if (a.status === 'paused') return { tone: 'paused', key: 'flow.st.paused' }
  if (a.status === 'triggered') return { tone: 'triggered', key: 'flow.st.triggered' }
  const dataOk = !!q && q.price != null && (q.state === 'live' || q.state === 'delayed')
  if (!dataOk) return { tone: 'unavailable', key: 'flow.st.unavailable' }
  const fresh = !!a.last_evaluated_at && Date.now() - new Date(a.last_evaluated_at).getTime() < EVAL_FRESH_MIN * 60_000
  return fresh ? { tone: 'watching', key: 'flow.st.monitoring' } : { tone: 'live', key: 'flow.st.active' }
}

function stages(t: FlowText, a: FlowAuto | null, q: AssetQuote | null, intl: string): Stage[] {
  const dataOk = !!q && q.price != null && (q.state === 'live' || q.state === 'delayed')
  const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) : '')
  const assetStage: Stage = { key: 'asset', title: q ? `${q.name} · ${q.id}` : t('flow.asset'), value: q?.price != null ? formatPrice(q.price) : t('flow.dataUnavailable'),
    note: q?.changePct != null ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}% 24h` : undefined, state: dataOk ? 'ok' : 'error' }
  if (!a) {
    // Illustration: the real asset and price, and the steps an automation goes
    // through — none of them shown as running.
    return [assetStage,
      { key: 'cond', title: t('flow.condition'), value: t('flow.yourCondition'), state: 'neutral' },
      { key: 'feed', title: t('flow.feed'), value: dataOk ? t(q!.state === 'live' ? 'flow.feedLive' : 'flow.feedDelayed') : t('flow.dataUnavailable'), state: dataOk ? 'ok' : 'error' },
      { key: 'engine', title: t('flow.engine'), value: t('flow.engineEvery'), state: 'neutral' },
      { key: 'status', title: t('flow.status'), value: t('flow.st.none'), state: 'neutral' },
      { key: 'action', title: t('flow.action'), value: t('flow.inApp'), state: 'neutral' }]
  }
  const target = isPct(a.kind) ? `${a.target}%` : formatPrice(a.target)
  const fresh = !!a.last_evaluated_at && Date.now() - new Date(a.last_evaluated_at).getTime() < EVAL_FRESH_MIN * 60_000
  const paused = a.status === 'paused'
  const st = flowStatus(a, q)
  return [
    assetStage,
    { key: 'cond', title: t('flow.condition'), value: t(`flow.kind.${a.kind}`, { target }), state: paused ? 'off' : 'ok' },
    { key: 'feed', title: t('flow.feed'), value: dataOk ? t(q!.state === 'live' ? 'flow.feedLive' : 'flow.feedDelayed') : t('flow.dataUnavailable'), state: paused ? 'off' : dataOk ? 'ok' : 'error' },
    { key: 'engine', title: t('flow.engine'),
      value: a.last_evaluated_at ? t('flow.checkedAt', { time: time(a.last_evaluated_at) }) : t('flow.notChecked'),
      note: a.status === 'active' && a.last_error ? a.last_error : undefined,
      state: paused ? 'off' : a.status === 'failed' ? 'error' : a.status === 'triggered' ? 'done' : fresh ? 'ok' : 'waiting' },
    { key: 'status', title: t('flow.status'), value: t(st.key),
      note: a.status === 'triggered' && a.trigger_price != null ? t('flow.triggeredAt', { price: formatPrice(a.trigger_price), time: time(a.triggered_at) }) : undefined,
      state: a.status === 'triggered' ? 'done' : a.status === 'failed' ? 'error' : paused ? 'off' : st.tone === 'unavailable' ? 'error' : 'waiting' },
    { key: 'action', title: t('flow.action'), value: a.status === 'triggered' ? t('flow.notified') : t('flow.willNotify'),
      state: a.status === 'triggered' ? 'done' : paused || a.status === 'failed' ? 'off' : 'neutral' },
  ]
}

const NODE: Record<StageState, string> = {
  ok: 'border-emerald-500/35 bg-emerald-500/[0.05]', done: 'border-amber-300/45 bg-amber-300/[0.06]', waiting: 'border-sky-500/30 bg-sky-500/[0.04]',
  error: 'border-red-500/35 bg-red-500/[0.05]', off: 'border-ink-700 bg-ink-900/40 opacity-70', neutral: 'border-ink-700 bg-ink-900/40',
}
const DOT: Record<StageState, string> = { ok: 'bg-emerald-400', done: 'bg-amber-300', waiting: 'bg-sky-400', error: 'bg-red-400', off: 'bg-slate-500', neutral: 'bg-slate-500' }

// Full 3D only where it is cheap: no reduced-motion preference, a wide enough
// screen and a capable device. Otherwise the same flow, flat.
function useLite() {
  const [lite, setLite] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const decide = () => setLite(mq.matches || window.innerWidth < 640 || (navigator.hardwareConcurrency || 8) < 4)
    decide()
    mq.addEventListener?.('change', decide)
    window.addEventListener('resize', decide, { passive: true })
    return () => { mq.removeEventListener?.('change', decide); window.removeEventListener('resize', decide) }
  }, [])
  return lite
}

export function AutomationFlow({ automation, quote, t, intl, label, illustration = false, vertical = false }: {
  automation: FlowAuto | null; quote: AssetQuote | null; t: FlowText; intl: string; label: string; illustration?: boolean; vertical?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const lite = useLite()
  // One observer per flow, removed once revealed (no scroll listeners).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const list = stages(t, automation, quote, intl)
  const st = flowStatus(automation, quote)
  return (
    <div ref={ref} className={`flow ${shown ? 'flow-in' : ''} ${lite ? 'flow-lite' : 'flow-3d'} ${vertical ? 'flow-v' : ''}`} aria-label={label} role="group">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <StatusIndicator tone={st.tone} label={illustration ? t('flow.illustration') : t(st.key)} pulse={!illustration && (st.tone === 'watching' || st.tone === 'live')} />
        {illustration && <span className="text-[11px] text-fg-faint">{t('flow.illustrationNote')}</span>}
      </div>
      <ol className="flow-track">
        {list.map((s, i) => {
          const next = list[i + 1]
          // A connector "flows" only between two stages that are both live.
          const live = !!next && (s.state === 'ok' || s.state === 'done') && (next.state === 'ok' || next.state === 'done' || next.state === 'waiting')
          return (
            <li key={s.key} className="flow-step" style={{ ['--i' as string]: i }}>
              <div className={`flow-node rounded-xl border p-3 ${NODE[s.state]}`} data-state={s.state}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.state]}`} aria-hidden="true" />
                  <p className="text-[11px] uppercase tracking-[0.1em] text-fg-faint truncate">{s.title}</p>
                </div>
                <p className="mt-1 text-[13px] font-medium text-fg tabular-nums break-words">{s.value}</p>
                {s.note && <p className="mt-0.5 text-[11px] text-fg-muted break-words">{s.note}</p>}
              </div>
              {next && <span className={`flow-link ${live ? 'flow-link-live' : ''}`} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Compact five-dot version for list cards (same states, no motion).
export function FlowDots({ automation, quote, t }: { automation: FlowAuto; quote: AssetQuote | null; t: FlowText }) {
  const list = stages(t, automation, quote, 'en')
  return (
    <ol className="flex items-center gap-1" aria-label={list.map(s => `${s.title}: ${s.value}`).join('; ')}>
      {list.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1" title={`${s.title}: ${s.value}`}>
          <span className={`h-2 w-2 rounded-full ${DOT[s.state]}`} />
          {i < list.length - 1 && <span className={`h-px w-4 ${s.state === 'ok' || s.state === 'done' ? 'bg-emerald-400/50' : 'bg-ink-600'}`} />}
        </li>
      ))}
    </ol>
  )
}

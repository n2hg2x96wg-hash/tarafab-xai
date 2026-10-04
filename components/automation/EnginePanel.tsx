'use client'

import { useEffect, useRef, useState } from 'react'
import { useEngineStatus, type EngineState } from '@/lib/engineStatus'
import { authFetch, readJson } from '@/lib/authFetch'

// The automation engine panel (client Investments page and landing preview).
// Every state shown is verified: the engine status comes from the database's
// view of the engine's own heartbeat; a client's rule count and timeline come
// from their own automation records and events. Admin presentation settings
// change names and copy only. The engine evaluates rules and records/notifies;
// it does not place trades, and nothing here implies it generates returns.

const LABEL: Record<EngineState, string> = { running: 'Running · monitoring', degraded: 'Delayed', offline: 'Offline', unavailable: 'Unavailable' }
const TONE: Record<EngineState, string> = { running: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.07]', degraded: 'text-amber-300 border-amber-500/30 bg-amber-500/[0.07]', offline: 'text-fg-muted border-ink-600 bg-ink-800/60', unavailable: 'text-fg-muted border-ink-600 bg-ink-800/60' }
const EVENT_LABEL: Record<string, string> = { created: 'Rule created', triggered: 'Condition met · notification sent', resumed: 'Rule resumed', paused: 'Rule paused' }

function ago(iso: string | null) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}

type Auto = { id: string; status: string; asset_id: string }
type Ev = { id: number | string; event: string; created_at: string; automation_id: string }

export function EnginePanel({ variant = 'client', className = '' }: { variant?: 'client' | 'preview'; className?: string }) {
  const { status, state, loading, presentation: p } = useEngineStatus()
  const ref = useRef<HTMLDivElement>(null)
  const [mine, setMine] = useState<{ rules: Auto[]; events: Ev[] } | null | 'error'>(null)

  // Client: their own rules and events (scoped by row level security server-side).
  useEffect(() => {
    if (variant !== 'client') return
    let alive = true
    authFetch('/api/client/automations').then(r => readJson<{ automations?: Auto[]; events?: Ev[] }>(r))
      .then(r => { if (alive) setMine(Array.isArray(r?.automations) ? { rules: r.automations, events: Array.isArray(r.events) ? r.events : [] } : 'error') })
      .catch(() => { if (alive) setMine('error') })
    return () => { alive = false }
  }, [variant])

  // Animate only while on screen.
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(e => el.toggleAttribute('data-vis', e[0].isIntersecting)); io.observe(el); return () => io.disconnect()
  }, [])

  if (variant === 'client' && !p.panel_visible) return null
  if (variant === 'preview' && !p.preview_visible) return null
  const running = state === 'running'
  const activeRules = mine && mine !== 'error' ? mine.rules.filter(r => r.status === 'active').length : null
  const events = mine && mine !== 'error' ? [...mine.events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 4) : []

  return (
    <section ref={ref} className={`engine-panel panel p-5 relative overflow-hidden ${className}`} data-engine-state={state} data-anim={p.animation} aria-labelledby={`eng-${variant}`}>
      <div className="flex items-start gap-4">
        <div className="engine-orb shrink-0" aria-hidden="true">
          <span className="eo-ring r1" /><span className="eo-ring r2" /><span className="eo-sweep" />
          <span className="eo-pt p1" /><span className="eo-pt p2" /><span className="eo-pt p3" />
          <span className="eo-core">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M3 12v2M21 12v2" /></svg>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-accent">{variant === 'preview' ? 'Automation layer' : 'Automation'}</p>
          <h3 id={`eng-${variant}`} className="mt-0.5 text-[16px] font-semibold text-fg truncate">{p.display_name}</h3>
          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] ${TONE[state]}`} data-engine-label>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400 board-pulse' : state === 'degraded' ? 'bg-amber-400' : 'bg-fg-faint'}`} aria-hidden="true" />
            {loading ? 'Checking…' : LABEL[state]}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <div className="min-w-0"><dt className="text-[11px] text-fg-faint">Last check</dt><dd className="text-fg tabular-nums">{status ? ago(status.last_ok_at) : '—'}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] text-fg-faint">Monitoring</dt><dd className="text-fg truncate" title={status?.monitored.join(', ')}>{status && status.monitored_count ? `${status.monitored.slice(0, 3).join(' · ')}${status.monitored_count > 3 ? ` +${status.monitored_count - 3}` : ''}` : p.asset_labels}</dd></div>
        {variant === 'client' && <div className="min-w-0"><dt className="text-[11px] text-fg-faint">Your active rules</dt><dd className="text-fg tabular-nums">{activeRules == null ? (mine === 'error' ? 'Unavailable' : '—') : activeRules}</dd></div>}
        {variant === 'preview' && <div className="min-w-0 col-span-2"><dt className="text-[11px] text-fg-faint">Automation</dt><dd className="text-fg-muted">Rules evaluated automatically · activity recorded in your account</dd></div>}
      </dl>

      {variant === 'client' && (
        <div className="mt-4">
          <p className="text-[11px] text-fg-faint mb-1.5">Your recent automation activity</p>
          {events.length ? (
            <ol className="engine-timeline space-y-2">
              {events.map(e => <li key={e.id} className="flex items-center justify-between gap-3 text-[12.5px]"><span className="text-fg-muted truncate">{EVENT_LABEL[e.event] || e.event}</span><span className="text-fg-faint tabular-nums shrink-0">{ago(e.created_at)}</span></li>)}
            </ol>
          ) : <p className="text-[12.5px] text-fg-muted">{mine === 'error' ? 'Activity unavailable right now.' : 'No automation activity yet. Create a rule in Automation to start monitoring.'}</p>}
        </div>
      )}

      <p className="mt-4 text-[12px] text-fg-muted leading-relaxed">{p.description}</p>
      <p className="mt-2 text-[11px] text-fg-faint leading-relaxed">Automation does not guarantee investment returns. Market and investment outcomes can vary.</p>
    </section>
  )
}

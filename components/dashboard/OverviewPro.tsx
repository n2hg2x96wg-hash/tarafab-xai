'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { authFetch, readJson } from '@/lib/authFetch'
import { formatPrice, type AssetQuote, type Timeframe } from '@/lib/assets'
import { ageLabel, effectiveState, marketNow, quoteAgeMs, type MarketState } from '@/lib/marketStatus'
import { loadChart, useAssets } from '@/components/markets/useAssets'
import { useEngineStatus } from '@/lib/engineStatus'
import { AssetMark } from '@/components/dashboard/OverviewParts'
import { IconRadar } from '@/components/Icons'

/* Premium Overview panels (Bitcoin market, automation status, watchlist).
   Every number on these panels comes from a server record or the shared
   market feed: nothing is estimated, and a missing value reads as
   unavailable instead of being filled in. */

const STATE_TEXT: Record<MarketState, string> = { live: 'Live', delayed: 'Delayed', stale: 'Stale', unavailable: 'Unavailable' }
const STATE_PILL: Record<MarketState, string> = {
  live: 'border-emerald-500/30 bg-emerald-500/[.08] text-emerald-300',
  delayed: 'border-amber-500/30 bg-amber-500/[.08] text-amber-300',
  stale: 'border-amber-500/30 bg-amber-500/[.08] text-amber-300',
  unavailable: 'border-[rgb(var(--contrast)/.12)] bg-[rgb(var(--contrast)/.04)] text-fg-muted',
}
export function StatePill({ state, at }: { state: MarketState; at?: string | null }) {
  const age = state !== 'live' && state !== 'unavailable' ? ageLabel(at) : ''
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11.5px] font-medium whitespace-nowrap ${STATE_PILL[state]}`} data-feed-state={state}>
      <span className={`w-1.5 h-1.5 rounded-full ${state === 'live' ? 'bg-emerald-400 live-dot' : state === 'unavailable' ? 'bg-fg-faint' : 'bg-amber-400'}`} aria-hidden="true" />
      {STATE_TEXT[state]}{age ? <span className="text-fg-faint font-normal">· {age}</span> : null}
    </span>
  )
}

const pctText = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`
const pctTone = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? 'text-fg-faint' : n > 0 ? 'price-up' : n < 0 ? 'price-down' : 'text-fg-muted'
const axisNum = (v: number) => v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? v.toFixed(2) : v.toPrecision(3)
const compactNum = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(2)

function updatedText(t: ReturnType<typeof useI18n>['t'], iso: string | null | undefined) {
  const ms = quoteAgeMs(iso)
  if (ms == null) return ''
  return t('common.updated', { time: ms < 60_000 ? t('common.justNow') : `${ageLabel(iso)} ago` })
}

/* Price chart: real candle points only. Lines and fill are drawn in an SVG
   stretched to the panel; axis labels, the crosshair and the tooltip are
   HTML so text never stretches. */
function ProChart({ points, tf }: { points: [number, number][]; tf: Timeframe }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 1000, H = 300, PAD = 18
  const g = useMemo(() => {
    const vals = points.map(p => p[1]); const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
    const t0 = points[0][0], t1 = points[points.length - 1][0], tspan = t1 - t0 || 1
    const xy = points.map(([t, v]) => [((t - t0) / tspan) * W, PAD + (1 - (v - min) / span) * (H - PAD * 2)] as [number, number])
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
    const ticks = [0, 1, 2, 3, 4].map(k => max - (span * k) / 4)
    const xt = [0, 1, 2, 3, 4].map(k => t0 + (tspan * k) / 4)
    return { xy, line, area: `${line}L${W},${H}L0,${H}Z`, ticks, xt, min, max }
  }, [points])
  const fmtX = (ms: number) => {
    const d = new Date(ms)
    return tf === '1H' || tf === '4H' || tf === '1D' ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : tf === '1W' ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
      : tf === '1M' ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0; for (let i = 1; i < g.xy.length; i++) if (Math.abs(g.xy[i][0] - x) < Math.abs(g.xy[best][0] - x)) best = i
    setHover(best)
  }
  const h = hover != null ? { p: points[hover], x: g.xy[hover][0] / W * 100, y: g.xy[hover][1] / H * 100 } : null
  return (
    <div className="pro-chart" data-pro-chart={points.length}>
      <div className="flex gap-2">
        <div ref={ref} className="relative flex-1 min-w-0 h-[190px] sm:h-[230px] touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          role="img" aria-label={`Bitcoin price, ${tf}: from ${formatPrice(points[0][1])} to ${formatPrice(points[points.length - 1][1])}`}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="proFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--accent))" stopOpacity=".32" /><stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" /></linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map(k => <line key={k} x1="0" x2={W} y1={PAD + ((H - PAD * 2) * k) / 4} y2={PAD + ((H - PAD * 2) * k) / 4} className="pro-grid" vectorEffect="non-scaling-stroke" />)}
            <path d={g.area} fill="url(#proFill)" className="chart-fade" />
            <path d={g.line} fill="none" className="pro-line chart-fade" vectorEffect="non-scaling-stroke" />
          </svg>
          {h && <>
            <span className="pro-cross" style={{ left: `${h.x}%` }} aria-hidden="true" />
            <span className="pro-dot" style={{ left: `${h.x}%`, top: `${h.y}%` }} aria-hidden="true" />
            <span className="pro-tip" style={{ left: `${Math.min(82, Math.max(18, h.x))}%`, top: `${Math.max(0, h.y - 4)}%` }} data-chart-tip>
              <b className="tabular-nums">{formatPrice(h.p[1])}</b>
              <span className="text-fg-faint">{new Date(h.p[0]).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          </>}
        </div>
        <ul className="w-[58px] sm:w-[64px] shrink-0 flex flex-col justify-between py-[3%] text-[10.5px] sm:text-[11px] tabular-nums text-fg-faint text-right" aria-hidden="true">
          {g.ticks.map((v, i) => <li key={i}>{axisNum(v)}</li>)}
        </ul>
      </div>
      <ul className="mt-1.5 mr-[66px] sm:mr-[72px] flex justify-between text-[10.5px] sm:text-[11px] text-fg-faint tabular-nums" aria-hidden="true">
        {g.xt.map((v, i) => <li key={i} className={i === 1 || i === 3 ? 'max-sm:hidden' : ''}>{fmtX(v)}</li>)}
      </ul>
    </div>
  )
}

const TFS: Timeframe[] = ['1H', '1D', '1W', '1M', '1Y']

/* Bitcoin market panel: price, 24h move and status from the shared quote
   (the same one the ticker, Markets board and landing page use), history
   from the real candle feed, and 24h figures only where the provider gave
   them. With no usable quote it says so instead of drawing a chart. */
export function BtcMarketPanel({ onOpenMarkets }: { onOpenMarkets: () => void }) {
  const { t } = useI18n()
  const { assets, error, reload, now } = useAssets()
  const btc = assets?.find(a => a.id === 'BTC') || null
  const state: MarketState | 'loading' = btc ? effectiveState(btc, error, now) : assets === null && !error ? 'loading' : 'unavailable'
  const [tf, setTf] = useState<Timeframe>('1D')
  const [chart, setChart] = useState<{ k: string; points: [number, number][]; note?: string } | null>(null)
  useEffect(() => {
    const k = tf, ac = new AbortController()
    loadChart('BTC', tf, ac.signal)
      .then(v => setChart({ k, points: v.available ? v.points.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [], note: v.available ? undefined : v.reason }))
      .catch(e => { if ((e as Error)?.name !== 'AbortError') setChart({ k, points: [] }) })
    return () => ac.abort()
  }, [tf])
  const pts = chart && chart.k === tf ? chart : null
  const usable = btc && btc.price != null && state !== 'unavailable' && state !== 'loading'
  const stats: [string, string | null][] = [
    [t('market.high24h'), usable && btc.high != null ? formatPrice(btc.high) : null],
    [t('market.low24h'), usable && btc.low != null ? formatPrice(btc.low) : null],
    [t('market.volume24h'), usable && btc.volume != null ? `${compactNum(btc.volume)} BTC` : null],
  ]
  return (
    <section className="panel ovx-card ovx-pro ovx-btc p-4 sm:p-5" aria-labelledby="ovx-btc" data-btc-panel={state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AssetMark id="BTC" size={30} />
            <h3 id="ovx-btc" className="text-[15px] font-semibold text-fg">Bitcoin price <span className="text-fg-faint font-normal">BTC/USD</span></h3>
            {state !== 'loading' && <StatePill state={state} at={btc?.updatedAt} />}
          </div>
          {state === 'loading' ? <div className="mt-3 skeleton h-9 w-56" aria-hidden="true" />
            : usable ? (
              <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[28px] sm:text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-fg" data-btc-price>{formatPrice(btc.price)}</span>
                <span className={`text-[14px] font-medium tabular-nums ${pctTone(btc.changePct)}`}>{pctText(btc.changePct)} <span className="text-fg-faint font-normal">(24h)</span></span>
              </p>
            ) : null}
          {usable && <p className="mt-1.5 text-[12px] text-fg-faint" data-btc-updated>{updatedText(t, btc.updatedAt)}{btc.source ? ` · ${btc.source}` : ''}</p>}
        </div>
        <div className="ovx-tf" role="group" aria-label="Chart range">
          {TFS.map(x => <button key={x} type="button" onClick={() => setTf(x)} aria-pressed={tf === x} className={`ovx-tf-btn ${tf === x ? 'is-on' : ''}`}>{x}</button>)}
        </div>
      </div>

      {state === 'unavailable' ? (
        <div className="mt-4 rounded-xl border border-[rgb(var(--contrast)/.08)] px-4 py-10 text-center" data-btc-unavailable>
          <p className="text-[14px] text-fg">Bitcoin price is unavailable right now.</p>
          <p className="mt-1 text-[12.5px] text-fg-faint">Nothing is shown rather than an estimate.</p>
          <button type="button" onClick={() => reload()} className="btn btn-outline btn-sm mt-4">{t('common.tryAgain')}</button>
        </div>
      ) : (
        <div className="mt-3">
          {pts == null ? <div className="skeleton h-[214px] sm:h-[254px]" aria-hidden="true" />
            : pts.points.length > 1 ? <ProChart points={pts.points} tf={tf} />
            : <p className="h-[214px] sm:h-[254px] grid place-items-center text-[13px] text-fg-faint text-center px-4" data-chart-empty>{pts.note || t('ov2.chartUnavailable')}</p>}
        </div>
      )}

      <dl className="ovx-btc-stats mt-4 grid grid-cols-3 gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="ovx-btc-stat min-w-0">
            <dt className="text-[11px] sm:text-[11.5px] leading-tight text-fg-faint break-words">{k}</dt>
            <dd className="mt-0.5 text-[13px] sm:text-[14px] font-semibold tabular-nums text-fg truncate">{v ?? <span className="text-fg-faint font-normal">—</span>}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onOpenMarkets} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:brightness-110 min-h-9">All markets <span aria-hidden="true">→</span></button>
    </section>
  )
}

/* Automation status. The engine watches markets and notifies; it does not
   place trades, so the panel shows monitoring facts only: the engine's own
   verified state and last check, and this client's own rules and events. */
const AUTO_EVENT: Record<string, string> = { created: 'Rule created', triggered: 'Condition met · notification sent', resumed: 'Rule resumed', paused: 'Rule paused' }
function agoShort(iso: string | null | undefined) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((marketNow() - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString()
}
type Rule = { id: string; asset_id: string; status: string }
type RuleEvent = { id: number; event: string; created_at: string; automation_id: string }
export function AutomationStatusPanel({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  const { status, state, loading, refreshFailed, refreshed, presentation } = useEngineStatus()
  const [data, setData] = useState<{ rules: Rule[]; events: (RuleEvent & { asset?: string })[] } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    authFetch('/api/client/automations').then(r => readJson<{ automations?: Rule[]; events?: RuleEvent[] }>(r))
      .then(r => { if (!alive) return
        const rules = Array.isArray(r.automations) ? r.automations : []
        const asset = new Map(rules.map(a => [a.id, a.asset_id]))
        setData({ rules, events: (Array.isArray(r.events) ? r.events : []).map(e => ({ ...e, asset: asset.get(e.automation_id) })) }); setFailed(false) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [refreshed])
  if (!presentation.panel_visible) return null
  const label = loading ? 'Connecting…' : state === 'unavailable' && refreshFailed ? 'Not connected'
    : ({ running: 'Monitoring active', paused: 'Paused', maintenance: 'Maintenance', degraded: 'Delayed', offline: 'Offline', unavailable: 'Unavailable' } as const)[state]
  const on = state === 'running'
  const amber = state === 'paused' || state === 'degraded' || state === 'maintenance'
  const pill = on ? STATE_PILL.live : amber ? STATE_PILL.delayed : STATE_PILL.unavailable
  const connected = !!status && !refreshFailed
  const assets = status?.monitored?.length ? status.monitored : []
  const active = data ? data.rules.filter(r => r.status === 'active').length : null
  const met = data ? data.rules.filter(r => r.status === 'triggered').length : null
  const stream: { key: string; label: string; at: string; tone: string }[] = []
  if (status?.last_ok_at) stream.push({ key: 'c', label: `Automation check completed${status.last_evaluated != null ? ` · ${status.last_evaluated} rule${status.last_evaluated === 1 ? '' : 's'}` : ''}`, at: status.last_ok_at, tone: 'bg-emerald-400' })
  if (status?.market_at) stream.push({ key: 'm', label: `Market monitored${assets.length ? ` · ${assets.slice(0, 2).join(', ')}` : ''}`, at: status.market_at, tone: 'bg-sky-400' })
  for (const e of data?.events || []) stream.push({ key: `e${e.id}`, label: `${AUTO_EVENT[e.event] || e.event}${e.asset ? ` · ${e.asset}` : ''}`, at: e.created_at, tone: e.event === 'triggered' ? 'bg-amber-400' : 'bg-fg-faint' })
  stream.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); stream.splice(3)
  const tile = (k: string, v: ReactNode, sub: string, attr: string) => (
    <div className="ovx-auto-tile min-w-0" data-auto-tile={attr}>
      <dt className="text-[11px] sm:text-[11.5px] leading-tight text-fg-faint break-words">{k}</dt>
      <dd className="mt-1 text-[18px] sm:text-[20px] leading-none font-semibold tabular-nums text-fg truncate">{v}</dd>
      <dd className="mt-1.5 text-[11px] text-fg-faint truncate">{sub}</dd>
    </div>
  )
  return (
    <section className="panel ovx-card ovx-pro ovx-auto2 p-4 sm:p-5 flex flex-col" aria-labelledby="ov-auto" data-ov-automation={loading ? 'connecting' : state}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="ovx-auto-icon" aria-hidden="true"><IconRadar width={18} height={18} /></span>
          <h3 id="ov-auto" className="text-[15px] font-semibold text-fg">{presentation.display_name || 'Automation status'}</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-semibold whitespace-nowrap ${pill}`} data-ov-auto-state>
          <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-400 cc-pulse' : amber ? 'bg-amber-400' : 'bg-fg-faint'}`} aria-hidden="true" />{label}
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-muted">{t('ov2.autoNote')}</p>
      <dl className="mt-3.5 grid grid-cols-3 gap-2">
        {tile('Active rules', active ?? (failed ? '—' : <span className="inline-block h-5 w-8 rounded skeleton align-middle" aria-hidden="true" />), 'your rules', 'active')}
        {tile('Triggered', met ?? (failed ? '—' : <span className="inline-block h-5 w-8 rounded skeleton align-middle" aria-hidden="true" />), 'notified', 'met')}
        {tile(t('ov2.autoLastCheck'), <span className="text-[15px] sm:text-[16px]">{agoShort(status?.last_ok_at)}</span>, status?.monitored_count ? `${status.monitored_count} market${status.monitored_count === 1 ? '' : 's'}` : '—', 'last')}
      </dl>
      {assets.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={t('ov2.autoWatching')}>
          <span className="text-[11.5px] text-fg-faint mr-0.5">{t('ov2.autoWatching')}</span>
          {assets.slice(0, 5).map(a => <span key={a} className="ovx-chip">{a}</span>)}
          {assets.length > 5 && <span className="text-[11.5px] text-fg-faint">+{assets.length - 5}</span>}
        </div>
      )}
      <div className="mt-3.5 pt-3 border-t border-[rgb(var(--contrast)/.06)] flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint mb-2">XAI activity</p>
        {stream.length ? (
          <ol className="space-y-2" data-ov-activity>
            {stream.map(x => (
              <li key={x.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex items-center gap-2 min-w-0"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${x.tone}`} aria-hidden="true" /><span className="text-fg-muted truncate">{x.label}</span></span>
                <span className="text-fg-faint tabular-nums shrink-0">{agoShort(x.at)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[12.5px] text-fg-muted" data-ov-activity-empty>{loading || (data === null && !failed) ? 'Loading activity…' : 'No recent automation activity.'}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] text-fg-muted min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? (on ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-fg-faint'}`} aria-hidden="true" />
          <span className="truncate" data-ov-auto-service>{connected ? (on ? 'Connected · checks every minute' : 'Connected') : loading ? 'Connecting' : 'Not connected'}</span>
        </span>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:brightness-110 min-h-9 shrink-0">View automation <span aria-hidden="true">→</span></button>
      </div>
    </section>
  )
}

/* Watchlist: the assets this client follows (their own watchlist), with the
   shared quote and its status. This is market data, not holdings: the
   account's money is the balance above, and no token balances are implied. */
export function WatchlistPanel({ enabled, onOpenMarkets, onOpenAsset }: { enabled: boolean; onOpenMarkets: () => void; onOpenAsset?: (id: string) => void }) {
  const { t } = useI18n()
  const { assets, error, now } = useAssets()
  const [ids, setIds] = useState<string[] | null>(enabled ? null : [])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    authFetch('/api/client/watchlist').then(r => readJson<{ assets?: string[] }>(r))
      .then(r => { if (alive) setIds(Array.isArray(r.assets) ? r.assets.filter(x => typeof x === 'string') : []) })
      .catch(() => { if (alive) setIds([]) })
    return () => { alive = false }
  }, [enabled])
  const own = (ids || []).length > 0
  const rows: AssetQuote[] = useMemo(() => {
    const list = (assets || []).filter(a => a.price != null)
    const pick = own ? (ids || []).map(id => list.find(a => a.id === id)).filter((a): a is AssetQuote => !!a) : list.filter(a => a.category === 'crypto')
    return pick.slice(0, 4)
  }, [assets, ids, own])
  return (
    <section className="panel ovx-card ovx-pro overflow-hidden" aria-labelledby="ov-watch" data-ov-watchlist={own ? 'own' : 'markets'}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1">
        <h3 id="ov-watch" className="text-[15px] font-semibold text-fg">{own ? 'Your watchlist' : 'Markets'}</h3>
        <button type="button" onClick={onOpenMarkets} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1 whitespace-nowrap">{t('common.viewAll')} <span aria-hidden="true">→</span></button>
      </div>
      {(assets === null && !error) || ids === null ? (
        <div className="px-4 sm:px-5 pb-4 space-y-3 pt-2" aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="skeleton h-10" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-4 sm:px-5 pb-5 pt-2 text-[13px] text-fg-muted">{error ? 'Market data is unavailable right now.' : 'No market quotes to show yet.'}</p>
      ) : (
        <ul className="px-2 pb-2">
          {rows.map(a => {
            const st = effectiveState(a, error, now)
            return (
              <li key={a.id} data-market-row={a.id}>
                <button type="button" onClick={onOpenAsset ? () => onOpenAsset(a.id) : onOpenMarkets} className="ovx-row w-full flex items-center justify-between gap-3 rounded-xl px-2.5 sm:px-3 py-2.5 text-left">
                  <span className="flex items-center gap-3 min-w-0">
                    <AssetMark id={a.id} size={34} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] text-fg truncate">{a.name} <span className="text-fg-faint">({a.id})</span></span>
                      <span className="block text-[11.5px] text-fg-faint truncate">{st === 'live' ? '24h change' : `${STATE_TEXT[st]}${ageLabel(a.updatedAt) ? ` · ${ageLabel(a.updatedAt)}` : ''}`}</span>
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13.5px] font-semibold tabular-nums text-fg">{formatPrice(a.price)}</span>
                    <span className={`block text-[12px] font-medium tabular-nums ${pctTone(a.changePct)}`}>{pctText(a.changePct)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!own && rows.length > 0 && <p className="px-4 sm:px-5 pb-3 -mt-1 text-[11.5px] text-fg-faint">Market prices, not holdings. Add assets to your watchlist in Markets.</p>}
    </section>
  )
}

// Today's date and time in the client's own locale (display only).
export function useClockText(intl: string) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id) }, [])
  if (!now) return null
  return { date: now.toLocaleDateString(intl, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), time: now.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) }
}

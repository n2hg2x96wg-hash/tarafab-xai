'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { formatPrice, type AssetQuote, type Timeframe } from '@/lib/assets'
import { effectiveState, type MarketState } from '@/lib/marketStatus'
import { loadChart, useAssets } from '@/components/markets/useAssets'
import { AreaChart, Sparkline } from '@/components/markets/Charts'
import dynamic from 'next/dynamic'

const BitcoinGrowth3D = dynamic(() => import('@/components/three/BitcoinGrowth3D'), { ssr: false })
// Coin on the banner's right; on phones smaller and further right, behind the text.
const placeBannerCoin = (w: number, h: number) => {
  if (w >= 640) {
    const size = h * 0.72, x = w - h * 0.72, y = h * 0.5
    return { x, y, size, lineFrom: { x: w * 0.5, y: h * 1.02 }, lineTo: { x: x - size * 0.56, y: y + size * 0.08 } }
  }
  const size = h * 0.54, x = w - size * 0.2, y = h * 0.28
  return { x, y, size, lineFrom: { x: w * 0.58, y: h * 1.02 }, lineTo: { x: x - size * 0.5, y: y + size * 0.3 } }
}

/* Building blocks of the client Overview. Each one shows only what the
   server returned: no balances, prices, returns or automation states are
   made up here, and a missing figure reads as unavailable. */

// Welcome banner. The artwork is decorative (empty alt, hidden from assistive
// tech); the banner keeps the dark palette in both themes, so its own tokens
// are pinned to the dark values in globals.css (.ovx-hero).
export function OverviewHero({ title, body, aside, icon, id = 'ovx-hello', kind = 'overview' }: { title: string; body: string; aside?: ReactNode; icon?: ReactNode; id?: string; kind?: string }) {
  return (
    <section className="ovx-hero relative overflow-hidden rounded-[20px]" aria-labelledby={id} data-ov-hero={kind === 'overview' ? '' : undefined} data-funds-hero={kind === 'overview' ? undefined : kind}>
      {/* Warm rock bed and bokeh behind the coin. */}
      <div className="ovx-hero-backdrop" aria-hidden="true" />
      {/* Live 3D coin and growth line; the still artwork shows until the
          first frame is drawn, and stays if WebGL is unavailable. */}
      <BitcoinGrowth3D variant="banner" place={placeBannerCoin} className="ovx-hero-3d"
        // eslint-disable-next-line @next/next/no-img-element
        fallback={<img src="/dashboard/hero-bitcoin.webp" alt="" aria-hidden="true" width={1200} height={672} decoding="async" fetchPriority="low" className="ovx-hero-art" />} />
      <div className="relative min-w-0 max-w-[30rem]">
        {icon && <span className="ovx-hero-icon" aria-hidden="true">{icon}</span>}
        <h2 id={id} className="text-[22px] sm:text-[28px] leading-tight font-semibold tracking-[-0.02em] text-fg [overflow-wrap:normal] [word-break:normal]">{title}</h2>
        <p className="mt-1.5 text-[13.5px] sm:text-[14.5px] leading-relaxed text-fg-muted">{body}</p>
        {aside && <div className="mt-3.5">{aside}</div>}
      </div>
    </section>
  )
}

const STATE_DOT: Record<MarketState, string> = { live: 'bg-emerald-400 live-dot', delayed: 'bg-amber-400', stale: 'bg-amber-400', unavailable: 'bg-fg-faint' }
const STATE_LABEL: Record<MarketState, string> = { live: 'Live', delayed: 'Delayed', stale: 'Stale', unavailable: 'Unavailable' }

function FeedBadge({ state }: { state: MarketState }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-faint whitespace-nowrap" data-feed-state={state}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />{STATE_LABEL[state]}
    </span>
  )
}

// A plain coin mark (symbol in a tinted circle); no third-party logos.
const MARK: Record<string, [string, string]> = {
  BTC: ['₿', 'bg-[#f7931a]/15 text-[#f7931a]'], ETH: ['Ξ', 'bg-indigo-400/15 text-indigo-300'], USDT: ['₮', 'bg-emerald-400/15 text-emerald-300'],
  SOL: ['◎', 'bg-violet-400/15 text-violet-300'], XRP: ['✕', 'bg-sky-400/15 text-sky-300'], BNB: ['B', 'bg-amber-300/15 text-amber-300'],
}
export function AssetMark({ id, size = 34 }: { id: string; size?: number }) {
  const [glyph, tone] = MARK[id] || [id.slice(0, 1), 'bg-[rgb(var(--contrast)/.08)] text-fg-muted']
  return <span className={`shrink-0 rounded-full grid place-items-center font-semibold ${tone}`} style={{ width: size, height: size, fontSize: Math.round(size * .44) }} aria-hidden="true">{glyph}</span>
}

const pctText = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`
const pctTone = (n: number | null) => n == null ? 'text-fg-faint' : n > 0 ? 'price-up' : n < 0 ? 'price-down' : 'text-fg-muted'

function useWide() {
  const [wide, setWide] = useState<boolean | null>(null)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const on = () => setWide(m.matches); on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

// Points for one asset/timeframe from the shared candle cache; null while
// loading, [] when the source has no chart for it.
function useChart(id: string | null, tf: Timeframe) {
  const [s, setS] = useState<{ k: string; points: [number, number][]; note?: string } | null>(null)
  useEffect(() => {
    if (!id) return
    const k = `${id}:${tf}`, ac = new AbortController()
    loadChart(id, tf, ac.signal)
      .then(v => setS({ k, points: v.available ? v.points : [], note: v.available ? undefined : v.reason }))
      .catch(e => { if ((e as Error)?.name !== 'AbortError') setS({ k, points: [] }) })
    return () => ac.abort()
  }, [id, tf])
  return s && s.k === `${id}:${tf}` ? s : null
}

const SNAP_TF: Timeframe[] = ['1D', '1W', '1M']

/* Market snapshot: the shared market feed (the same one Markets uses), its
   freshness state per asset, and the real candle history. Desktop shows one
   asset's chart with asset tabs; phones show a short list with 24h lines. */
export function MarketSnapshot({ onOpenMarkets, onOpenAsset }: { onOpenMarkets: () => void; onOpenAsset?: (id: string) => void }) {
  const { t } = useI18n()
  const { assets, error, reload } = useAssets()
  const wide = useWide()
  const list = useMemo(() => (assets || []).filter(a => a.category === 'crypto' && a.chart).slice(0, 4), [assets])
  const [sel, setSel] = useState<string | null>(null)
  const [tf, setTf] = useState<Timeframe>('1D')
  const cur = list.find(a => a.id === sel) || list[0] || null
  const chart = useChart(wide && cur ? cur.id : null, tf)
  const head = (
    <div className="flex items-center justify-between gap-3 px-5 pt-4">
      <h3 id="ovx-mkt" className="text-[15px] font-semibold text-fg">{t('ov2.marketTitle')}</h3>
      <button onClick={onOpenMarkets} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1 whitespace-nowrap">{t('common.viewAll')}</button>
    </div>
  )
  if (!assets && !error) {
    return <section className="panel ovx-card" aria-labelledby="ovx-mkt" aria-busy="true">{head}<div className="p-5 space-y-3"><div className="skeleton h-9 w-2/3" /><div className="skeleton h-28" /></div></section>
  }
  if (!list.length) {
    return (
      <section className="panel ovx-card" aria-labelledby="ovx-mkt" data-market-snapshot="unavailable">
        {head}
        <div className="px-5 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-fg-muted">{t('ov2.marketUnavailable')}</p>
          <button onClick={() => reload()} className="btn btn-outline btn-sm">{t('common.tryAgain')}</button>
        </div>
      </section>
    )
  }
  return (
    <section className="panel ovx-card overflow-hidden" aria-labelledby="ovx-mkt" data-market-snapshot>
      {head}
      {wide === false ? (
        <ul className="mt-2 pb-2" data-market-list>
          {list.map(a => <MarketRow key={a.id} a={a} refreshFailed={error} onOpen={onOpenAsset ? () => onOpenAsset(a.id) : undefined} />)}
        </ul>
      ) : cur && (
        <div className="px-5 pb-4">
          <div className="mt-3 flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label={t('ov2.marketTitle')}>
            {list.map(a => (
              <button key={a.id} role="tab" aria-selected={a.id === cur.id} onClick={() => setSel(a.id)}
                className={`ovx-seg ${a.id === cur.id ? 'is-on' : ''}`} data-asset-tab={a.id}>{a.id}</button>
            ))}
            <button onClick={onOpenMarkets} className="ovx-seg">{t('ov2.all')}</button>
          </div>
          <div className="mt-4 flex items-center gap-3 min-w-0">
            <AssetMark id={cur.id} />
            <div className="min-w-0">
              <p className="text-[13px] text-fg-muted truncate">{cur.name} <span className="text-fg-faint">({cur.id})</span></p>
              <p className="flex items-baseline gap-x-2 flex-wrap">
                <span className="text-[24px] leading-tight font-semibold tabular-nums text-fg whitespace-nowrap" data-snapshot-price>{cur.price != null ? formatPrice(cur.price) : '—'}</span>
                <span className={`text-[13.5px] font-medium tabular-nums whitespace-nowrap ${pctTone(cur.changePct)}`}>{pctText(cur.changePct)} <span className="text-fg-faint font-normal">24h</span></span>
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 min-w-0">
              <FeedBadge state={effectiveState(cur, error)} />
              {onOpenAsset && <button onClick={() => onOpenAsset(cur.id)} className="text-[12.5px] font-medium text-accent hover:brightness-110 whitespace-nowrap" data-asset-details={cur.id}>{t('ov2.details')} →</button>}
            </span>
            <div className="flex gap-1" role="group" aria-label="Timeframe">
              {SNAP_TF.map(x => <button key={x} onClick={() => setTf(x)} aria-pressed={tf === x} className={`ovx-seg ovx-seg-sm ${tf === x ? 'is-on' : ''}`}>{x}</button>)}
            </div>
          </div>
          <div className="ovx-chart mt-2">
            {chart == null ? <div className="skeleton h-[170px]" aria-hidden="true" />
              : chart.points.length > 1 ? <AreaChart points={chart.points} up={chart.points[chart.points.length - 1][1] >= chart.points[0][1]} format={formatPrice} label={`${cur.name} ${tf}`} />
              : <p className="h-[170px] grid place-items-center text-[13px] text-fg-faint text-center px-4">{chart.note || t('ov2.chartUnavailable')}</p>}
          </div>
        </div>
      )}
    </section>
  )
}

function MarketRow({ a, refreshFailed, onOpen }: { a: AssetQuote; refreshFailed: boolean; onOpen?: () => void }) {
  const chart = useChart(a.id, '1D')
  const st = effectiveState(a, refreshFailed)
  return (
    <li data-market-row={a.id}>
      <button type="button" onClick={onOpen} disabled={!onOpen} aria-label={`${a.name} (${a.id})`} className="ovx-row w-full text-left flex items-center gap-3 px-5 py-2.5 disabled:cursor-default">
      <AssetMark id={a.id} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-fg truncate">{a.name}</p>
        <p className="text-[11.5px] text-fg-faint flex items-center gap-2">{a.id}<FeedBadge state={st} /></p>
      </div>
      <div className="w-16 h-7 shrink-0">{chart && chart.points.length > 1 ? <Sparkline points={chart.points} up={a.changePct == null ? null : a.changePct >= 0} className="w-full h-full" /> : null}</div>
      <div className="text-right shrink-0 min-w-[78px]">
        <p className="text-[13.5px] font-semibold tabular-nums text-fg whitespace-nowrap">{a.price != null ? formatPrice(a.price) : '—'}</p>
        <p className={`text-[12px] tabular-nums whitespace-nowrap ${pctTone(a.changePct)}`}>{pctText(a.changePct)}</p>
      </div>
      {onOpen && <svg className="shrink-0 text-fg-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>}
      </button>
    </li>
  )
}

// Small reassurance chips for the funds pages' banner (static statements
// about how the process works; no figures).
export function HeroChips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="How it works">
      {items.map(x => (
        <li key={x} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[rgb(var(--contrast)/.12)] bg-[rgb(var(--contrast)/.05)] text-[12px] text-fg-muted backdrop-blur-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{x}
        </li>
      ))}
    </ul>
  )
}

// "What happens next": the steps of the existing review process.
export function NextSteps({ title, steps, children }: { title: string; steps: [string, string][]; children?: ReactNode }) {
  return (
    <section className="panel ovx-card p-4 sm:p-5" aria-label={title} data-next-steps>
      {children}
      <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
      <ol className="fx-steps mt-3.5">
        {steps.map(([t, b], i) => (
          <li key={t} className="fx-step">
            <span className="fx-step-n" aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <p className="fx-step-t">{t}</p>
              <p className="fx-step-b">{b}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

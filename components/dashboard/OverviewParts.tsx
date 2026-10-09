'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { formatPrice, type AssetQuote, type Timeframe } from '@/lib/assets'
import { effectiveState, type MarketState } from '@/lib/marketStatus'
import { loadChart, useAssets } from '@/components/markets/useAssets'
import { AreaChart, Sparkline } from '@/components/markets/Charts'

/* Building blocks of the client Overview. Each one shows only what the
   server returned: no balances, prices, returns or automation states are
   made up here, and a missing figure reads as unavailable. */

// Welcome banner. The artwork is decorative (empty alt, hidden from assistive
// tech); the banner keeps the dark palette in both themes, so its own tokens
// are pinned to the dark values in globals.css (.ovx-hero).
export function OverviewHero({ title, body, aside }: { title: string; body: string; aside?: ReactNode }) {
  return (
    <section className="ovx-hero relative overflow-hidden rounded-[20px]" aria-labelledby="ovx-hello" data-ov-hero>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dashboard/hero-bitcoin.webp" alt="" aria-hidden="true" width={1200} height={672} decoding="async" fetchPriority="low" className="ovx-hero-art" />
      <div className="relative min-w-0 max-w-[30rem]">
        <h2 id="ovx-hello" className="text-[22px] sm:text-[28px] leading-tight font-semibold tracking-[-0.02em] text-fg [overflow-wrap:normal] [word-break:normal]">{title}</h2>
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
export function MarketSnapshot({ onOpenMarkets }: { onOpenMarkets: () => void }) {
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
          {list.map(a => <MarketRow key={a.id} a={a} refreshFailed={error} />)}
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
            <FeedBadge state={effectiveState(cur, error)} />
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

function MarketRow({ a, refreshFailed }: { a: AssetQuote; refreshFailed: boolean }) {
  const chart = useChart(a.id, '1D')
  const st = effectiveState(a, refreshFailed)
  return (
    <li className="flex items-center gap-3 px-5 py-2.5" data-market-row={a.id}>
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
    </li>
  )
}

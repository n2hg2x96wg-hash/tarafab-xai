'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RequestError, authFetch, errorText, readJson } from '@/lib/authFetch'
import { PremiumBadge, openPremiumGate, refreshPremium, usePremium, usePt } from '@/components/premium/Premium'
import { formatPrice, TIMEFRAMES, type AssetQuote, type Timeframe } from '@/lib/assets'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { marketsText } from '@/lib/i18n/markets'
import { IconChart, IconClose, IconLock } from '@/components/Icons'
import { AreaChart, Sparkline, sma } from './Charts'
import { loadChart, useAssets } from './useAssets'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { effectiveState } from '@/lib/marketStatus'

type Cat = 'all' | 'crypto' | 'stock' | 'index' | 'watchlist'
const CATS: Cat[] = ['all', 'crypto', 'stock', 'index', 'watchlist']
export const NEW_AUTOMATION_KEY = 'tarafab.newAutomationAsset'

export function useMk() {
  const { locale, intl } = useI18n()
  const t = useCallback((k: string, v?: Record<string, string | number>) => marketsText(locale, k, v), [locale])
  return { t, intl }
}

export function StatusBadge({ a }: { a: AssetQuote }) {
  const { t } = useMk()
  const [label, cls, live] =
    a.state === 'unavailable' || a.state === 'error' ? [a.reason === 'not_connected' ? t('status.notConnected') : a.reason === 'temporary' ? t('status.temporary') : t('status.unavailable'), 'text-fg-faint border-ink-600', false]
    : a.state === 'stale' ? [t('status.stale'), 'text-amber-300 border-amber-500/30', false]
    : a.market === '24/7' ? [t('status.247'), 'text-emerald-300 border-emerald-500/30', true]
    : a.market === 'open' ? [a.state === 'delayed' ? t('status.delayed') : t('status.open'), 'text-emerald-300 border-emerald-500/30', a.state === 'live']
    : [t('status.closed'), 'text-fg-muted border-ink-600', false]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" aria-hidden="true" />}{label}
    </span>
  )
}

function Change({ a, className = '' }: { a: AssetQuote; className?: string }) {
  if (a.changePct == null) return <span className={`text-fg-faint ${className}`}>—</span>
  const up = a.changePct >= 0
  return <span className={`tabular-nums ${up ? 'price-up' : 'price-down'} ${className}`}>{up ? '+' : ''}{a.changePct.toFixed(2)}%</span>
}

export function AssetCenter({ onAutomate }: { onAutomate: (assetId: string) => void }) {
  const { t } = useMk()
  const { assets: raw, error, reload } = useAssets()
  // Shared status rule (lib/marketStatus): an old quote, or one shown after a
  // failed refresh, is labelled stale everywhere in this view.
  const assets = useMemo(() => raw ? raw.map(a => ({ ...a, state: effectiveState(a, error) as AssetQuote['state'] })) : raw, [raw, error])
  // Admin → Feature controls (watchlist / charts); data is kept when off.
  const feature = useFeatures()
  const watchOff = hiddenState(feature('watchlist')), chartsOff = hiddenState(feature('charts'))
  const [cat, setCat] = useState<Cat>('all')
  const [q, setQ] = useState('')
  const [watch, setWatch] = useState<string[] | null>(null)
  const [watchErr, setWatchErr] = useState('')
  const [popped, setPopped] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sparks, setSparks] = useState<Record<string, [number, number][]>>({})

  useEffect(() => {
    authFetch('/api/client/watchlist').then(r => readJson<{ assets: string[] }>(r)).then(j => setWatch(j.assets)).catch(() => setWatch([]))
  }, [])

  const toggleWatch = async (id: string) => {
    if (!watch) return
    const on = !watch.includes(id)
    setWatch(w => (on ? [...(w || []), id] : (w || []).filter(x => x !== id))); setPopped(id); setWatchErr('')
    try {
      await readJson(await authFetch('/api/client/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset: id, on }) }))
      refreshPremium()
    } catch (e) {
      setWatch(w => (on ? (w || []).filter(x => x !== id) : [...(w || []), id])); setWatchErr(errorText(e))
      if (e instanceof RequestError && e.status === 402) openPremiumGate(e.message)
    }
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (assets || []).filter(a =>
      (cat === 'all' || (cat === 'watchlist' ? (watch || []).includes(a.id) : a.category === cat)) &&
      (!s || a.id.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)))
      .sort((x, y) => (cat === 'watchlist' ? (watch || []).indexOf(x.id) - (watch || []).indexOf(y.id) : 0))
  }, [assets, cat, q, watch])

  // Sparklines for the cards on screen (crypto only; cached per session).
  useEffect(() => {
    const ac = new AbortController()
    if (chartsOff) return
    const need = list.filter(a => a.chart && !sparks[a.id]).slice(0, 12)
    ;(async () => {
      for (const a of need) {
        try { const c = await loadChart(a.id, '1D', ac.signal); if (c.available) setSparks(s => ({ ...s, [a.id]: c.points })) } catch { /* left empty */ }
      }
    })()
    return () => ac.abort()
  }, [list, chartsOff]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = (assets || []).filter(a => a.price != null && a.changePct != null && (a.state === 'live' || a.state === 'delayed'))
  const gainer = live.length ? live.reduce((m, a) => (a.changePct! > m.changePct! ? a : m)) : null
  const loser = live.length ? live.reduce((m, a) => (a.changePct! < m.changePct! ? a : m)) : null
  const selected = (assets || []).find(a => a.id === open) || null

  return (
    <section className="space-y-4" aria-labelledby="asset-center">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="asset-center" className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('center.title')}</h2>
          <p className="text-sm text-fg-faint mt-0.5">{t('center.subtitle')}</p>
        </div>
        <p className="text-[12px] text-fg-faint">{t('center.disclosure')}</p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="panel p-4"><p className="text-[12px] text-fg-faint">{t('center.tracked')}</p>
          <p className="mt-1 text-lg font-semibold text-fg tabular-nums">{assets ? t('center.liveOf', { live: live.length, total: assets.length }) : '—'}</p></div>
        {[['center.topGainer', gainer], ['center.topLoser', loser]].map(([k, a]) => (
          <button key={k as string} disabled={!a} onClick={() => a && setOpen((a as AssetQuote).id)} className="panel p-4 text-left hover:border-ink-500 transition-colors disabled:opacity-60">
            <p className="text-[12px] text-fg-faint">{t(k as string)}</p>
            {a ? <p className="mt-1 text-lg font-semibold text-fg"><span>{(a as AssetQuote).name}</span> <Change a={a as AssetQuote} className="text-base" /></p> : <p className="mt-1 text-sm text-fg-muted">{t('status.unavailable')}</p>}
          </button>
        ))}
      </div>

      {/* Search + categories */}
      <div className="panel p-3 flex flex-col sm:flex-row gap-3">
        <label className="sr-only" htmlFor="asset-search">{t('center.search')}</label>
        <input id="asset-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('center.searchPh')} className="field sm:flex-1" />
        <div className="seg flex-wrap" role="tablist" aria-label={t('center.categories')}>
          {CATS.filter(c => !(watchOff && c === 'watchlist')).map(c => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`seg-btn ${cat === c ? 'seg-btn-on' : ''}`}>
              {t(`cat.${c}`)}{c === 'watchlist' && watch ? ` (${watch.length})` : ''}
            </button>
          ))}
        </div>
      </div>
      {watchErr && <p role="alert" className="text-sm text-red-400">{watchErr}</p>}

      {!assets && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="panel h-[148px] animate-pulse" />)}</div>
      ) : !assets ? (
        <div className="panel p-6 text-sm text-fg-muted flex flex-wrap items-center gap-3"><span>{t('center.loadError')}</span><button onClick={() => reload()} className="btn btn-sm btn-outline">{t('common.retry')}</button></div>
      ) : list.length === 0 ? (
        <div className="panel px-6 py-10 text-center"><p className="text-sm text-fg">{cat === 'watchlist' && !q ? t('center.watchEmpty') : t('center.noMatch')}</p>
          {cat === 'watchlist' && !q && <p className="text-[13px] text-fg-faint mt-1">{t('center.watchEmptyBody')}</p>}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(a => {
            const on = (watch || []).includes(a.id)
            return (
              <li key={a.id} className="panel asset-card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => setOpen(a.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-[15px] font-semibold text-fg truncate">{a.name}</p>
                    <p className="text-[12px] text-fg-faint">{a.id} · {t(`cat.${a.category}`)}{a.note ? ` · ${a.note}` : ''}</p>
                  </button>
                  <button onClick={() => toggleWatch(a.id)} aria-pressed={on} aria-label={on ? t('watch.remove', { name: a.name }) : t('watch.add', { name: a.name })}
                    className={`w-9 h-9 -mr-1 -mt-1 rounded-md flex items-center justify-center text-lg ${on ? 'text-amber-300' : 'text-fg-faint hover:text-fg'} ${popped === a.id ? 'star-pop' : ''}`}>{on ? '★' : '☆'}</button>
                </div>
                <button onClick={() => setOpen(a.id)} className="flex items-end justify-between gap-3 text-left">
                  <div>
                    {a.price != null ? <p className="text-xl font-semibold tabular-nums text-fg">{formatPrice(a.price)}</p> : <p className="text-sm text-fg-muted">{t('status.dataUnavailable')}</p>}
                    <Change a={a} className="text-[13px]" />
                  </div>
                  {!chartsOff && <Sparkline points={sparks[a.id] || []} up={a.changePct == null ? null : a.changePct >= 0} className="w-28 h-9 shrink-0" />}
                </button>
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge a={a} />
                  {a.automation && <button onClick={() => onAutomate(a.id)} className="text-[12px] text-brand-300 hover:text-brand-200">{t('center.automate')}</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {selected && <AssetDetail a={selected} watchOff={watchOff} chartsOff={chartsOff} watched={(watch || []).includes(selected.id)} onWatch={() => toggleWatch(selected.id)} onAutomate={() => { setOpen(null); onAutomate(selected.id) }} onClose={() => setOpen(null)} />}
    </section>
  )
}

function AssetDetail({ a, watched, onWatch, onAutomate, onClose, watchOff = false, chartsOff = false }: { a: AssetQuote; watched: boolean; watchOff?: boolean; chartsOff?: boolean; onWatch: () => void; onAutomate: () => void; onClose: () => void }) {
  const { t, intl } = useMk()
  const [tf, setTf] = useState<Timeframe>('1D')
  const [chart, setChart] = useState<{ points: [number, number][]; available: boolean; reason?: string; premium?: boolean } | null>(null)
  const { info: prem } = usePremium()
  const pt = usePt()
  const isPremium = !!prem?.premium
  const lockedTf = (x: Timeframe) => !isPremium && !!prem?.premium_timeframes.includes(x)
  const [smaOn, setSmaOn] = useState(false)
  const overlays = useMemo(() => (smaOn && isPremium && chart?.points.length
    ? [{ values: sma(chart.points, 20), color: 'rgb(56 189 248)', label: 'SMA 20' }, { values: sma(chart.points, 50), color: 'rgb(251 191 36)', label: 'SMA 50' }]
    : []), [smaOn, isPremium, chart])
  useEffect(() => {
    if (!a.chart || chartsOff) { setChart({ points: [], available: false }); return }
    const ac = new AbortController(); setChart(null)
    loadChart(a.id, tf, ac.signal).then(setChart).catch(() => { if (!ac.signal.aborted) setChart({ points: [], available: false }) })
    return () => ac.abort()
  }, [a.id, a.chart, tf, chartsOff])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const stats: [string, string][] = [
    [t('detail.high'), formatPrice(a.high)], [t('detail.low'), formatPrice(a.low)],
    [a.category === 'crypto' ? t('detail.open24') : t('detail.prevClose'), formatPrice(a.prevClose)],
    [t('detail.volume'), a.volume != null ? a.volume.toLocaleString(intl, { maximumFractionDigits: 0 }) + (a.category === 'crypto' ? ` ${a.id}` : '') : '—'],
    [t('detail.updated'), a.updatedAt ? new Date(a.updatedAt).toLocaleString(intl, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'],
  ]
  const firstLast = chart?.points.length ? chart.points[chart.points.length - 1][1] >= chart.points[0][1] : null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="asset-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm backdrop-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto panel rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 rise-in" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="asset-title" className="text-xl font-semibold text-fg">{a.name} <span className="text-fg-faint text-base font-normal">{a.id}</span></h3>
            <p className="text-[12px] text-fg-faint">{t(`cat.${a.category}`)}{a.note ? ` · ${a.note}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 -mt-2 rounded-md flex items-center justify-center text-fg-faint hover:text-fg" aria-label={t('common.close')}><IconClose width={18} height={18} /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          {a.price != null ? <p className="text-3xl font-semibold tabular-nums text-fg">{formatPrice(a.price)}</p> : <p className="text-base text-fg-muted">{t('status.dataUnavailable')}</p>}
          <Change a={a} className="text-lg" />
          <StatusBadge a={a} />
        </div>
        {!chartsOff && <div className="mt-5">
          {a.chart && (
            <div className="seg mb-3" role="tablist" aria-label={t('detail.timeframe')}>
              {TIMEFRAMES.map(x => <button key={x} role="tab" aria-selected={tf === x} onClick={() => (lockedTf(x) ? openPremiumGate(`${pt('pr.f.timeframes')}: ${x}`) : setTf(x))} className={`seg-btn ${tf === x ? 'seg-btn-on' : ''}`}>{x}{lockedTf(x) && <IconLock width={10} height={10} className="inline ml-0.5 -mt-0.5 text-amber-300" />}</button>)}
            </div>
          )}
          {a.chart && (
            <div className="mb-2 flex justify-end">
              <button onClick={() => (isPremium ? setSmaOn(v => !v) : openPremiumGate(pt('pr.f.indicators')))} aria-pressed={smaOn && isPremium}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${smaOn && isPremium ? 'border-sky-400/50 text-sky-300 bg-sky-400/10' : 'border-ink-700 text-fg-muted hover:text-fg'}`}>
                {pt('ch.sma')} {!isPremium && <PremiumBadge />}
              </button>
            </div>
          )}
          <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-2 min-h-[210px] flex items-center justify-center">
            {chart === null ? <div className="w-full h-[200px] animate-pulse rounded-lg bg-ink-800/60" />
              : chart.available ? <div className="w-full"><AreaChart points={chart.points} up={firstLast} format={formatPrice} label={t('detail.chartLabel', { name: a.name, tf })} overlays={overlays} /></div>
              : chart.premium ? <button onClick={() => openPremiumGate(`${pt('pr.f.timeframes')}: ${tf}`)} className="text-sm text-amber-300 flex items-center gap-2"><IconLock width={14} height={14} />{pt('pr.gateBody')}</button>
              : <p className="text-sm text-fg-muted flex items-center gap-2 px-4 text-center"><IconChart width={16} height={16} />{a.chart ? t('detail.chartUnavailable') : t('detail.chartNotOffered')}</p>}
          </div>
        </div>}
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map(([k, v]) => <div key={k} className="rounded-lg border border-ink-700/60 px-3 py-2"><dt className="text-[11px] text-fg-faint">{k}</dt><dd className="text-sm text-fg tabular-nums mt-0.5 break-words">{v}</dd></div>)}
        </dl>
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
          {!watchOff && <button onClick={onWatch} className="btn btn-outline flex-1">{watched ? `★ ${t('watch.inList')}` : `☆ ${t('watch.addShort')}`}</button>}
          {a.automation && <button onClick={onAutomate} className="btn btn-solid flex-1">{t('center.createAutomation')}</button>}
        </div>
        <p className="mt-4 text-[11px] text-fg-faint">{t('center.disclosure')}</p>
      </div>
    </div>
  )
}

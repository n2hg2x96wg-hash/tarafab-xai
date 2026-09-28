'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { ThemeSelector } from '@/components/ThemeSelector'
import { LanguageSelector } from '@/components/LanguageSelector'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

// Mirrors the dashboard menu. Core items are shown for reference and cannot
// be switched off; the database only accepts the optional ids anyway.
// Mirrors the client dashboard menu. Core items cannot be hidden (the
// database refuses to hide them too) but can be reordered and renamed.
const GROUPS: { label: TKey; items: { id: string; label: TKey; core?: boolean }[] }[] = [
  { label: 'nav2.groupOverview', items: [{ id: 'overview', label: 'dash.nav.overview', core: true }] },
  { label: 'nav3.groupMarkets', items: [
    { id: 'markets', label: 'dash.nav.markets' }, { id: 'marketActivity', label: 'nav3.marketActivity' }, { id: 'priceHistory', label: 'nav3.priceHistory' },
  ] },
  { label: 'nav2.groupPortfolio', items: [
    { id: 'portfolio', label: 'nav2.portfolio' }, { id: 'transactions', label: 'dash.nav.transactions' }, { id: 'performance', label: 'nav3.performance' },
  ] },
  { label: 'nav3.groupFunds', items: [
    { id: 'deposit', label: 'dash.nav.deposit' }, { id: 'withdraw', label: 'dash.nav.withdraw' },
    { id: 'depositHistory', label: 'nav2.depositHistory' }, { id: 'withdrawalHistory', label: 'nav2.withdrawalHistory' },
  ] },
  { label: 'nav2.groupAccount', items: [
    { id: 'profile', label: 'dash.nav.profile', core: true }, { id: 'security', label: 'nav2.security', core: true },
    { id: 'notifications', label: 'nav2.notifications' }, { id: 'preferences', label: 'nav2.preferences', core: true },
  ] },
  { label: 'nav2.groupSupport', items: [{ id: 'support', label: 'nav2.support' }] },
]
const ALL_IDS = GROUPS.flatMap(g => g.items.map(i => i.id))
// Full order: saved ids first, then the rest in default order.
const fullOrder = (saved: string[]) => [...saved.filter(id => ALL_IDS.includes(id)), ...ALL_IDS.filter(id => !saved.includes(id))]

type Config = { hidden: string[]; order: string[]; labels: Record<string, string>; updated_at: string | null }

// Accept only a well-formed setting; anything else is treated as a load error.
function parseConfig(v: unknown): Config | null {
  const c = (v as { config?: unknown } | null)?.config as Partial<Config> | undefined
  if (!c || !Array.isArray(c.hidden) || !c.hidden.every(h => typeof h === 'string')) return null
  const labels: Record<string, string> = {}
  if (c.labels && typeof c.labels === 'object') for (const [k, v] of Object.entries(c.labels)) if (typeof v === 'string') labels[k] = v
  return {
    hidden: c.hidden,
    order: Array.isArray(c.order) ? c.order.filter(x => typeof x === 'string') : [],
    labels,
    updated_at: typeof c.updated_at === 'string' ? c.updated_at : null,
  }
}

export default function AdminSettingsPage() {
  const { t, intl } = useI18n()
  const [config, setConfig] = useState<Config | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>(ALL_IDS)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const apply = useCallback((c: Config) => {
    setConfig(c); setHidden(c.hidden); setLabels(c.labels); setOrder(fullOrder(c.order))
  }, [])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const c = parseConfig(await readJson<unknown>(await authFetch('/api/client/nav-config')))
      if (!c) throw new Error('bad config')
      apply(c)
    } catch {
      setLoadError(t('adminSettings.loadFailed'))
    }
  }, [t, apply])

  useEffect(() => { load() }, [load])


  const cleanLabels = () => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
  const orderIsDefault = order.join() === ALL_IDS.join()
  const snapshot = (h: string[], o: string[], l: Record<string, string>) => JSON.stringify([[...h].sort(), o, Object.entries(l).sort()])
  const dirty = config !== null && snapshot(hidden, order, cleanLabels()) !== snapshot(config.hidden, fullOrder(config.order), config.labels)

  const move = (groupIds: string[], id: string, delta: -1 | 1) => {
    setSaved(false)
    setOrder(prev => {
      const inGroup = prev.filter(x => groupIds.includes(x))
      const i = inGroup.indexOf(id), j = i + delta
      if (j < 0 || j >= inGroup.length) return prev
      ;[inGroup[i], inGroup[j]] = [inGroup[j], inGroup[i]]
      let k = 0
      return prev.map(x => groupIds.includes(x) ? inGroup[k++] : x)
    })
  }

  const send = async (payload: { hidden: string[]; order?: string[]; labels?: Record<string, string> }) => {
    if (saving) return
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      const c = parseConfig(await readJson<unknown>(await authFetch('/api/admin/client-nav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })))
      if (!c) throw new Error('bad config')
      apply(c); setSaved(true)
    } catch (err) {
      setSaveError(errorText(err, t))
    } finally {
      setSaving(false)
    }
  }

  const save = () => send({ hidden, order: orderIsDefault ? [] : order, labels: cleanLabels() })
  const restore = () => { if (window.confirm(t('navAdmin.restoreConfirm'))) send({ hidden: [], order: [], labels: {} }) }

  return (
    <AdminLayout title={t('adminSettings.title')} subtitle={t('adminSettings.subtitle')}>
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5 items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <ThemeSelector variant="list" />
            <p className="text-xs text-slate-500 mt-3">{t('adminSettings.appearanceBody')}</p>
          </section>
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <LanguageSelector variant="list" />
          </section>
        </div>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5" aria-labelledby="nav-title">
          <h2 id="nav-title" className="text-base font-semibold text-white">{t('adminSettings.navTitle')}</h2>
          <p className="text-sm text-slate-400 mt-1 mb-4">{t('adminSettings.navBody')}</p>
          {loadError && <AdminLoadError message={loadError} onRetry={load} />}
          {!config && !loadError ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-11" />)}</div>
          ) : config && (
            <>
              <p className="text-xs text-slate-500 mb-3">{t('navAdmin.orderHint')}</p>
              <div className="space-y-4">
                {GROUPS.map(g => {
                  const ids = g.items.map(i => i.id)
                  const rows = order.filter(id => ids.includes(id)).map(id => g.items.find(i => i.id === id)!)
                  return (
                    <fieldset key={g.label} className="rounded-xl border border-white/[0.07]">
                      <legend className="px-2 ml-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{t(g.label)}</legend>
                      <ul className="divide-y divide-white/[0.06]">
                        {rows.map((s, idx) => {
                          const on = s.core || !hidden.includes(s.id)
                          const name = t(s.label)
                          return (
                            <li key={s.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 py-2">
                              <label className={`flex items-center gap-2.5 min-h-10 min-w-0 sm:w-44 shrink-0 ${s.core ? 'cursor-default' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={s.core || saving}
                                  aria-label={`${t('navAdmin.visible')}: ${name}`}
                                  onChange={e => { setSaved(false); setHidden(h => e.target.checked ? h.filter(x => x !== s.id) : [...h, s.id]) }}
                                  className="w-4 h-4 accent-violet-500 shrink-0"
                                />
                                <span className={`text-sm truncate ${on ? 'text-white' : 'text-slate-500 line-through'}`}>{name}</span>
                              </label>
                              <input
                                type="text"
                                value={labels[s.id] ?? ''}
                                maxLength={32}
                                disabled={saving}
                                onChange={e => { setSaved(false); setLabels(l => ({ ...l, [s.id]: e.target.value })) }}
                                placeholder={t('navAdmin.labelPlaceholder', { label: name })}
                                aria-label={t('navAdmin.labelFor', { label: name })}
                                className="input-field !py-2 !text-sm flex-1 min-w-[140px]"
                              />
                              <div className="flex items-center gap-1 shrink-0 ml-auto">
                                {s.core && <span className="text-[11px] text-slate-500 border border-white/[0.1] rounded px-1.5 py-0.5 mr-1">{t('adminSettings.required')}</span>}
                                <button type="button" onClick={() => move(ids, s.id, -1)} disabled={idx === 0 || saving} aria-label={t('navAdmin.moveUp', { label: name })} className="w-9 h-9 rounded-lg border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-30">↑</button>
                                <button type="button" onClick={() => move(ids, s.id, 1)} disabled={idx === rows.length - 1 || saving} aria-label={t('navAdmin.moveDown', { label: name })} className="w-9 h-9 rounded-lg border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-30">↓</button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </fieldset>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 mt-3">{t('adminSettings.requiredNote')}</p>
              <p className="text-xs text-slate-500 mt-1">
                {config.updated_at
                  ? t('adminSettings.lastChanged', { date: new Date(config.updated_at).toLocaleString(intl, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) })
                  : t('adminSettings.usingDefaults')}
              </p>
              {saveError && <p role="alert" className="mt-4 text-sm text-red-400">{saveError}</p>}
              {saved && <p role="status" className="mt-4 text-sm text-emerald-400">{t('adminSettings.saved')}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="w-full sm:w-auto px-5 py-3 rounded-xl text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t('common.saving') : t('adminSettings.save')}
              </button>
              <button onClick={restore} disabled={saving} className="px-5 py-3 rounded-xl text-sm font-medium text-slate-300 border border-white/[0.1] hover:bg-white/[0.05] disabled:opacity-50">
                {t('navAdmin.restore')}
              </button>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}

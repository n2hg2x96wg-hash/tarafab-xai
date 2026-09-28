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
const SECTIONS: { id: string; label: TKey; core?: boolean }[] = [
  { id: 'overview', label: 'dash.nav.overview', core: true },
  { id: 'portfolio', label: 'nav2.portfolio' },
  { id: 'markets', label: 'dash.nav.markets' },
  { id: 'transactions', label: 'dash.nav.transactions' },
  { id: 'deposit', label: 'dash.nav.deposit' },
  { id: 'withdraw', label: 'dash.nav.withdraw' },
  { id: 'depositHistory', label: 'nav2.depositHistory' },
  { id: 'withdrawalHistory', label: 'nav2.withdrawalHistory' },
  { id: 'profile', label: 'dash.nav.profile', core: true },
  { id: 'security', label: 'nav2.security', core: true },
  { id: 'preferences', label: 'nav2.preferences', core: true },
  { id: 'notifications', label: 'nav2.notifications' },
  { id: 'support', label: 'nav2.support' },
]

type Config = { hidden: string[]; updated_at: string | null }

// Accept only a well-formed setting; anything else is treated as a load error.
function parseConfig(v: unknown): Config | null {
  const c = (v as { config?: unknown } | null)?.config as Partial<Config> | undefined
  if (!c || !Array.isArray(c.hidden) || !c.hidden.every(h => typeof h === 'string')) return null
  return { hidden: c.hidden, updated_at: typeof c.updated_at === 'string' ? c.updated_at : null }
}

export default function AdminSettingsPage() {
  const { t, intl } = useI18n()
  const [config, setConfig] = useState<Config | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const c = parseConfig(await readJson<unknown>(await authFetch('/api/client/nav-config')))
      if (!c) throw new Error('bad config')
      setConfig(c); setHidden(c.hidden)
    } catch {
      setLoadError(t('adminSettings.loadFailed'))
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const dirty = config !== null && [...hidden].sort().join() !== [...(config.hidden || [])].sort().join()

  const save = async () => {
    if (saving) return
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      const c = parseConfig(await readJson<unknown>(await authFetch('/api/admin/client-nav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }),
      })))
      if (!c) throw new Error('bad config')
      setConfig(c); setHidden(c.hidden); setSaved(true)
    } catch (err) {
      setSaveError(errorText(err, t))
    } finally {
      setSaving(false)
    }
  }

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
              <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {SECTIONS.map(s => {
                  const on = s.core || !hidden.includes(s.id)
                  return (
                    <li key={s.id}>
                      <label className={`flex items-center gap-3 min-h-12 py-2 ${s.core ? 'cursor-default' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={s.core || saving}
                          onChange={e => { setSaved(false); setHidden(h => e.target.checked ? h.filter(x => x !== s.id) : [...h, s.id]) }}
                          className="w-4 h-4 accent-violet-500 shrink-0"
                        />
                        <span className={`flex-1 text-sm ${s.core ? 'text-slate-400' : 'text-white'}`}>{t(s.label)}</span>
                        {s.core && <span className="text-[11px] text-slate-500 border border-white/[0.1] rounded px-1.5 py-0.5">{t('adminSettings.required')}</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-slate-500 mt-3">{t('adminSettings.requiredNote')}</p>
              <p className="text-xs text-slate-500 mt-1">
                {config.updated_at
                  ? t('adminSettings.lastChanged', { date: new Date(config.updated_at).toLocaleString(intl, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) })
                  : t('adminSettings.usingDefaults')}
              </p>
              {saveError && <p role="alert" className="mt-4 text-sm text-red-400">{saveError}</p>}
              {saved && <p role="status" className="mt-4 text-sm text-emerald-400">{t('adminSettings.saved')}</p>}
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="mt-4 w-full sm:w-auto px-5 py-3 rounded-xl text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t('common.saving') : t('adminSettings.save')}
              </button>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}

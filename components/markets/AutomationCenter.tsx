'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RequestError, authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { openPremiumGate, refreshPremium } from '@/components/premium/Premium'
import { formatPrice, type AssetQuote } from '@/lib/assets'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconAlert, IconCheck, IconClose } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'
import { StatusBadge, useMk } from './AssetCenter'
import { useAssets } from './useAssets'
import { AutomationFlow, FlowDots } from '@/components/automation/AutomationFlow'

type Kind = 'price_above' | 'price_below' | 'pct_up' | 'pct_down' | 'move_abs'
type Auto = {
  id: string; asset_id: string; kind: Kind; target: number; name: string
  status: 'active' | 'paused' | 'triggered' | 'failed'
  last_evaluated_at: string | null; last_price: number | null; last_change_pct: number | null; last_data_state: string | null
  triggered_at: string | null; trigger_price: number | null; last_error: string | null; created_at: string
}
type Ev = { id: string; automation_id: string; event: string; price: number | null; created_at: string }
const KINDS: Kind[] = ['price_above', 'price_below', 'pct_up', 'pct_down', 'move_abs']
const isPct = (k: Kind) => k === 'pct_up' || k === 'pct_down' || k === 'move_abs'

export function AutomationCenter({ presetAsset, onPresetUsed }: { presetAsset: string | null; onPresetUsed: () => void }) {
  const { t, intl } = useMk()
  const { assets } = useAssets()
  const [items, setItems] = useState<Auto[] | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [loadError, setLoadError] = useState('')
  const [wizard, setWizard] = useState<{ asset?: string; edit?: Auto } | null>(null)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<Auto | null>(null)
  const [filter, setFilter] = useState<'all' | Auto['status']>('all')
  const [justArmed, setJustArmed] = useState('')
  const [openFlow, setOpenFlow] = useState('')
  const [btcPick, setBtcPick] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await readJson<{ automations: Auto[]; events: Ev[] }>(await authFetch('/api/client/automations'))
      setItems(r.automations); setEvents(r.events); setLoadError('')
    } catch (e) { setLoadError(errorText(e)) }
  }, [])
  useEffect(() => { load(); const i = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30_000); return () => clearInterval(i) }, [load])
  useEffect(() => { if (presetAsset) { setWizard({ asset: presetAsset }); onPresetUsed() } }, [presetAsset, onPresetUsed])

  const byId = useMemo(() => new Map((assets || []).map(a => [a.id, a])), [assets])
  const act = async (action: string, a: Auto) => {
    setBusyId(a.id); setError('')
    try {
      await readJson(await authFetch('/api/client/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: a.id }) }))
      if (action === 'resume') setJustArmed(a.id)
      setDeleting(null); await load(); refreshPremium()
    } catch (e) { setError(errorText(e)); if (e instanceof RequestError && e.status === 402) openPremiumGate(e.message) } finally { setBusyId('') }
  }

  const counts = (s: Auto['status']) => (items || []).filter(a => a.status === s).length
  const shown = (items || []).filter(a => filter === 'all' || a.status === filter)
  const describe = (a: Auto) => {
    const name = byId.get(a.asset_id)?.name || a.asset_id
    const tgt = isPct(a.kind) ? `${a.target}%` : formatPrice(a.target)
    return t(`kind.${a.kind}.sentence`, { name, target: tgt })
  }

  return (
    <section className="space-y-4" aria-labelledby="auto-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="auto-title" className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('auto.title')}</h2>
          <p className="text-sm text-fg-faint mt-0.5">{t('auto.subtitle')}</p>
        </div>
        <button onClick={() => setWizard({})} className="btn btn-solid w-full sm:w-auto">{t('auto.new')}</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['active', 'paused', 'triggered', 'failed'] as const).map(s => (
          <button key={s} onClick={() => setFilter(f => (f === s ? 'all' : s))} aria-pressed={filter === s}
            className={`panel p-3 text-left transition-colors ${filter === s ? 'border-brand-400/50' : 'hover:border-ink-500'}`}>
            <p className="text-[12px] text-fg-faint">{t(`auto.s.${s}`)}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{items ? counts(s) : '—'}</p>
          </button>
        ))}
        <div className="panel p-3 col-span-2 sm:col-span-1"><p className="text-[12px] text-fg-faint">{t('auto.s.total')}</p><p className="mt-1 text-xl font-semibold tabular-nums text-fg">{items ? items.length : '—'}</p></div>
      </div>
      <p className="text-[12px] text-fg-faint">{t('auto.howItWorks')}</p>

      {(() => {
        // Bitcoin automation: the live BTC quote and the client's own BTC rules.
        const btc = byId.get('BTC') || null
        const mine = (items || []).filter(a => a.asset_id === 'BTC')
        const rank = { active: 0, triggered: 1, paused: 2, failed: 3 } as const
        const ordered = [...mine].sort((x, y) => rank[x.status] - rank[y.status])
        const pick = ordered.find(a => a.id === btcPick) || ordered[0] || null
        return (
          <section className="panel p-4 sm:p-5 btc-auto" aria-labelledby="btc-auto-title">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 id="btc-auto-title" className="text-[15px] font-semibold text-fg">{t('btc.title')}</h3>
                <p className="text-[13px] text-fg-faint mt-0.5">{t('btc.subtitle')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ordered.length > 1 && (
                  <select value={pick?.id || ''} onChange={e => setBtcPick(e.target.value)} className="field !py-1.5 !text-[13px] w-auto" aria-label={t('btc.count', { n: ordered.length })}>
                    {ordered.map(a => <option key={a.id} value={a.id}>{a.name || describe(a)}</option>)}
                  </select>
                )}
                {!mine.length && items !== null && <button onClick={() => setWizard({ asset: 'BTC' })} className="btn btn-sm btn-solid">{t('btc.create')}</button>}
              </div>
            </div>
            <AutomationFlow automation={pick} quote={btc} t={t} intl={intl} label={t('btc.flowLabel')} illustration={!pick} />
          </section>
        )
      })()}
      {error && <div role="alert" className="alert alert-danger text-sm"><IconAlert width={16} height={16} className="shrink-0 mt-px" /><span>{error}</span></div>}

      {items === null && !loadError ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="panel h-[170px] animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="panel p-5 text-sm text-fg-muted flex flex-wrap items-center gap-3"><span>{loadError}</span><button onClick={load} className="btn btn-sm btn-outline">{t('common.retry')}</button></div>
      ) : shown.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="text-sm text-fg">{items!.length ? t('auto.noneInFilter') : t('auto.none')}</p>
          {!items!.length && <p className="text-[13px] text-fg-faint mt-1 mb-4">{t('auto.noneBody')}</p>}
          {!items!.length && <button onClick={() => setWizard({})} className="btn btn-solid">{t('auto.new')}</button>}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map(a => {
            const asset = byId.get(a.asset_id)
            const evs = events.filter(e => e.automation_id === a.id).slice(0, 3)
            return (
              <li key={a.id} className={`panel p-4 flex flex-col gap-3 ${justArmed === a.id ? 'arm-glow' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-fg truncate">{a.name || t('auto.defaultName', { name: asset?.name || a.asset_id })}</p>
                    <p className="text-[13px] text-fg-muted mt-0.5">{describe(a)}</p>
                  </div>
                  <span className={`tag shrink-0 ${a.status === 'active' ? 'text-emerald-400 border-emerald-500/30' : a.status === 'triggered' ? 'text-sky-300 border-sky-500/30' : a.status === 'failed' ? 'text-red-400 border-red-500/30' : 'text-fg-muted border-ink-600'}`}>{t(`auto.s.${a.status}`)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <div><dt className="text-fg-faint">{t('auto.target')}</dt><dd className="text-fg tabular-nums">{isPct(a.kind) ? `${a.target}%` : formatPrice(a.target)}</dd></div>
                  <div><dt className="text-fg-faint">{t('auto.current')}</dt><dd className="text-fg tabular-nums">{asset?.price != null ? formatPrice(asset.price) : t('status.dataUnavailable')}</dd></div>
                  <div><dt className="text-fg-faint">{t('auto.lastChecked')}</dt><dd className="text-fg-muted">{a.last_evaluated_at ? new Date(a.last_evaluated_at).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) : t('auto.notYet')}</dd></div>
                  <div><dt className="text-fg-faint">{t('auto.notification')}</dt><dd className="text-fg-muted">{t('auto.inApp')}</dd></div>
                  <div><dt className="text-fg-faint">{t('auto.created')}</dt><dd className="text-fg-muted">{new Date(a.created_at).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
                  <div><dt className="text-fg-faint">{t('auto.next')}</dt><dd className="text-fg-muted">{a.status === 'active' ? t('auto.nextMinute') : '—'}</dd></div>
                </dl>
                <button onClick={() => setOpenFlow(f => (f === a.id ? '' : a.id))} aria-expanded={openFlow === a.id} className="flex items-center gap-2 text-left">
                  <FlowDots automation={a} quote={asset || null} t={t} />
                  <span className="text-[11px] text-fg-faint underline underline-offset-2">{t('auto.flowLabel', { name: asset?.id || a.asset_id })}</span>
                </button>
                {openFlow === a.id && <AutomationFlow automation={a} quote={asset || null} t={t} intl={intl} label={t('auto.flowLabel', { name: asset?.name || a.asset_id })} vertical />}
                {a.status === 'triggered' && <p className="text-[12px] text-sky-300">{t('auto.triggeredAt', { price: formatPrice(a.trigger_price), time: a.triggered_at ? new Date(a.triggered_at).toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' }) : '' })}</p>}
                {a.status === 'active' && a.last_error && <p className="text-[12px] text-amber-300">{t('auto.waiting', { reason: a.last_error })}</p>}
                {evs.length > 0 && <p className="text-[11px] text-fg-faint truncate">{evs.map(e => `${t(`auto.ev.${e.event}`)} ${new Date(e.created_at).toLocaleDateString(intl, { day: 'numeric', month: 'short' })}`).join(' · ')}</p>}
                <div className="flex flex-wrap gap-2 mt-auto">
                  {a.status === 'active' && <button disabled={busyId === a.id} onClick={() => act('pause', a)} className="btn btn-sm btn-outline">{t('auto.pause')}</button>}
                  {(a.status === 'paused' || a.status === 'triggered' || a.status === 'failed') && <button disabled={busyId === a.id} onClick={() => act('resume', a)} className="btn btn-sm btn-outline">{a.status === 'paused' ? t('auto.resume') : t('auto.rearm')}</button>}
                  <button disabled={busyId === a.id} onClick={() => setWizard({ edit: a })} className="btn btn-sm btn-ghost">{t('auto.edit')}</button>
                  <button disabled={busyId === a.id} onClick={() => act('duplicate', a)} className="btn btn-sm btn-ghost">{t('auto.duplicate')}</button>
                  <button disabled={busyId === a.id} onClick={() => setDeleting(a)} className="btn btn-sm btn-ghost text-red-400">{t('auto.delete')}</button>
                  {busyId === a.id && <Spinner />}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {wizard && <Wizard assets={assets || []} initial={wizard} onClose={() => setWizard(null)} onDone={async id => { setWizard(null); if (id) setJustArmed(id); await load() }} />}
      {deleting && (
        <ConfirmModal title={t('auto.deleteTitle')} confirmLabel={t('auto.delete')} cancelLabel={t('wallet.cancel')} busy={busyId === deleting.id} onConfirm={() => act('delete', deleting)} onCancel={() => setDeleting(null)}>
          <p>{t('auto.deleteBody', { text: describe(deleting) })}</p>
        </ConfirmModal>
      )}
    </section>
  )
}

function Wizard({ assets, initial, onClose, onDone }: { assets: AssetQuote[]; initial: { asset?: string; edit?: Auto }; onClose: () => void; onDone: (id?: string) => void }) {
  const { t } = useMk()
  const edit = initial.edit
  const [step, setStep] = useState(edit ? 3 : initial.asset ? 2 : 1)
  const [assetId, setAssetId] = useState(edit?.asset_id || initial.asset || '')
  const [kind, setKind] = useState<Kind>(edit?.kind || 'price_above')
  const [target, setTarget] = useState(edit ? String(edit.target) : '')
  const [name, setName] = useState(edit?.name || '')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [key] = useState(() => newRequestKey())
  const asset = assets.find(a => a.id === assetId)
  const num = Number(target)
  const validTarget = Number.isFinite(num) && num > 0 && (!isPct(kind) || num <= 1000)
  const results = assets.filter(a => a.automation && (!q.trim() || a.id.toLowerCase().includes(q.trim().toLowerCase()) || a.name.toLowerCase().includes(q.trim().toLowerCase())))
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [busy, onClose])

  const save = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const body = edit ? { action: 'update', id: edit.id, kind, target: num, name } : { action: 'create', asset: assetId, kind, target: num, name, idempotency_key: key }
      const r = await readJson<{ automation: { id: string } }>(await authFetch('/api/client/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      onDone(r.automation.id); refreshPremium()
    } catch (e) { setError(errorText(e)); setBusy(false); if (e instanceof RequestError && e.status === 402) openPremiumGate(e.message) }
  }
  const sentence = asset ? t(`kind.${kind}.sentence`, { name: asset.name, target: isPct(kind) ? `${num}%` : formatPrice(num) }) : ''
  const steps = [t('wiz.asset'), t('wiz.condition'), t('wiz.target'), t('wiz.notify'), t('wiz.review')]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wiz-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm backdrop-in" onClick={() => !busy && onClose()} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto panel rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 rise-in" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3">
          <h3 id="wiz-title" className="text-lg font-semibold text-fg">{edit ? t('wiz.editTitle') : t('wiz.title')}</h3>
          <button onClick={onClose} disabled={busy} className="w-10 h-10 -mr-2 -mt-2 rounded-md flex items-center justify-center text-fg-faint hover:text-fg" aria-label={t('common.close')}><IconClose width={18} height={18} /></button>
        </div>
        <ol className="mt-3 flex gap-1.5" aria-label={t('wiz.progress')}>
          {steps.map((s, i) => <li key={s} className={`h-1 flex-1 rounded-full ${i + 1 <= step ? 'bg-accent' : 'bg-ink-700'}`} aria-current={i + 1 === step ? 'step' : undefined} title={s} />)}
        </ol>
        <p className="mt-2 text-[12px] text-fg-faint">{t('wiz.stepOf', { n: step, total: 5, name: steps[step - 1] })}</p>

        {step === 1 && (
          <div className="mt-4">
            <input autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('center.searchPh')} className="field" aria-label={t('center.search')} />
            <ul className="mt-3 max-h-[46vh] overflow-y-auto grid gap-2">
              {results.map(a => (
                <li key={a.id}><button onClick={() => { setAssetId(a.id); setStep(2) }} className="w-full flex items-center gap-3 rounded-lg border border-ink-700 hover:border-ink-500 px-3 py-2.5 text-left">
                  <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-fg truncate">{a.name} <span className="text-fg-faint font-normal">{a.id}</span></span><span className="block text-[12px] text-fg-faint">{a.price != null ? formatPrice(a.price) : t('status.dataUnavailable')}</span></span>
                  <StatusBadge a={a} /></button></li>
              ))}
              {!results.length && <li className="text-sm text-fg-muted px-1 py-4">{t('center.noMatch')}</li>}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 grid gap-2">
            {asset && <p className="text-sm text-fg-muted mb-1">{asset.name} · {asset.price != null ? formatPrice(asset.price) : t('status.dataUnavailable')}{asset.changePct != null ? ` · ${asset.changePct >= 0 ? '+' : ''}${asset.changePct.toFixed(2)}%` : ''}</p>}
            {KINDS.map(k => (
              <button key={k} onClick={() => { setKind(k); setStep(3) }} className={`rounded-lg border px-3 py-3 text-left ${kind === k ? 'border-brand-400/60 bg-brand-500/10' : 'border-ink-700 hover:border-ink-500'}`}>
                <span className="block text-sm font-medium text-fg">{t(`kind.${k}`)}</span><span className="block text-[12px] text-fg-faint">{t(`kind.${k}.help`)}</span></button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="mt-4">
            <label htmlFor="wiz-target" className="field-label">{isPct(kind) ? t('wiz.targetPct') : t('wiz.targetPrice')}</label>
            <input id="wiz-target" autoFocus inputMode="decimal" value={target} onChange={e => setTarget(e.target.value.replace(',', '.'))} placeholder={isPct(kind) ? '5' : asset?.price != null ? String(asset.price) : ''} className="field" />
            {asset?.price != null && !isPct(kind) && <p className="mt-1.5 text-[12px] text-fg-faint">{t('wiz.currentPrice', { price: formatPrice(asset.price) })}</p>}
            {target && !validTarget && <p className="mt-1.5 text-[12px] text-red-400">{isPct(kind) ? t('wiz.errPct') : t('wiz.errPrice')}</p>}
            {validTarget && asset?.price != null && !isPct(kind) && ((kind === 'price_above' && num <= asset.price) || (kind === 'price_below' && num >= asset.price)) && <p className="mt-1.5 text-[12px] text-amber-300">{t('wiz.alreadyMet')}</p>}
            <label htmlFor="wiz-name" className="field-label mt-4">{t('wiz.name')}</label>
            <input id="wiz-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={t('wiz.namePh')} className="field" />
          </div>
        )}

        {step === 4 && (
          <div className="mt-4 grid gap-2">
            <div className="rounded-lg border border-brand-400/60 bg-brand-500/10 px-3 py-3"><p className="text-sm font-medium text-fg">{t('auto.inApp')}</p><p className="text-[12px] text-fg-faint">{t('wiz.inAppHelp')}</p></div>
            <p className="text-[12px] text-fg-faint">{t('wiz.moreSoon')}</p>
          </div>
        )}

        {step === 5 && asset && (
          <div className="mt-4">
            <dl className="rounded-lg border border-ink-700 divide-y divide-ink-700/60 text-sm">
              {[[t('wiz.asset'), `${asset.name} (${asset.id})`], [t('wiz.condition'), t(`kind.${kind}`)], [t('wiz.target'), isPct(kind) ? `${num}%` : formatPrice(num)], [t('wiz.notify'), t('auto.inApp')], [t('wiz.name'), name || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3 py-2"><dt className="text-fg-faint">{k}</dt><dd className="text-fg text-right">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-fg-muted">{sentence}</p>
            <p className="mt-1 text-[12px] text-fg-faint">{t('wiz.oneShot')}</p>
          </div>
        )}

        {error && <div role="alert" className="alert alert-danger mt-4 text-sm"><IconAlert width={16} height={16} className="shrink-0 mt-px" /><span>{error}</span></div>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
          {step > (edit ? 2 : 1) && <button onClick={() => setStep(s => s - 1)} disabled={busy} className="btn btn-ghost">{t('wiz.back')}</button>}
          {step === 3 && <button onClick={() => setStep(4)} disabled={!validTarget} className="btn btn-solid sm:ml-auto">{t('wiz.next')}</button>}
          {step === 4 && <button onClick={() => setStep(5)} className="btn btn-solid sm:ml-auto">{t('wiz.next')}</button>}
          {step === 5 && <button onClick={save} disabled={busy} className="btn btn-solid sm:ml-auto">{busy ? <Spinner /> : <IconCheck width={16} height={16} />} {edit ? t('wiz.save') : t('wiz.create')}</button>}
        </div>
      </div>
    </div>
  )
}

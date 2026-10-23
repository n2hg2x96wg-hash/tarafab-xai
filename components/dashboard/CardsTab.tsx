'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { cardText } from '@/lib/i18n/cards'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconAlert, IconCard, IconCheck } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'
import { fmt, PageIntro } from '@/components/dashboard/shared'

type Design = { id: string; name: string; base_color: string }
type Application = { reference: string; status: string; design_name: string; color: string; nickname: string | null; fee: number; currency: string; issuer_name: string | null; created_at: string }
type Center = {
  designs: Design[]
  settings: { fee: number | null; currency: string; open: boolean; terms: string | null; issuer_name: string | null }
  preference: { design_id: string; design_name?: string; color: string; nickname: string | null; design_available: boolean } | null
  applications: Application[]
  has_active: boolean
  spendable: number
}
const ACTIVE = ['paid_submitted', 'under_review', 'approved', 'issued']
// Colour choices for the preview (the design's own colour is always first).
const SWATCHES = ['#c8962e', '#1b1e25', '#2b5b84', '#8a8f98', '#6d2f3b', '#1f5a4a', '#4b3a7a', '#b8b0a2']
const cleanNick = (s: string) => s.replace(/[^A-Za-z0-9 .'&-]/g, '').slice(0, 24)

// Card Center. Previews are free and create nothing financial. A paid
// application is only possible when an admin has opened applications with a
// fee, terms and an issuing partner; the server re-checks the balance and
// takes the fee once, in the same step that records the application.
export function CardsTab({ go, onAccountChanged }: { go: (id: string) => void; onAccountChanged: () => void }) {
  const { locale, intl } = useI18n()
  const t = useCallback((k: string, v?: Record<string, string | number>) => cardText(locale, k, v), [locale])
  const [data, setData] = useState<Center | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [design, setDesign] = useState('')
  const [color, setColor] = useState('')
  const [nickname, setNickname] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [accept, setAccept] = useState(false)
  const [review, setReview] = useState(false)
  const [paying, setPaying] = useState(false)
  const key = useRef('')

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const r = await readJson<Center>(await authFetch('/api/client/cards'))
      if (!Array.isArray(r?.designs) || !r.settings) throw new Error('malformed')
      setData(r)
      return r
    } catch (e) { setLoadErr(errorText(e)); return null }
  }, [])
  useEffect(() => {
    load().then(r => {
      if (!r) return
      const pref = r.preference && r.preference.design_available ? r.preference : null
      const first = r.designs[0]
      setDesign(pref?.design_id || first?.id || '')
      setColor(pref?.color || first?.base_color.toLowerCase() || SWATCHES[0])
      setNickname(r.preference?.nickname || '')
    })
  }, [load])

  const current = data?.designs.find(d => d.id === design) || null
  const money = (n: number, ccy = data?.settings.currency || 'USD') => `${fmt(n)} ${ccy}`
  const fee = data?.settings.fee ?? null
  const active = data?.applications.find(a => ACTIVE.includes(a.status)) || null
  const older = data?.applications.filter(a => a !== active) || []
  const short = fee != null && data ? Math.max(0, Math.round((fee - data.spendable) * 100) / 100) : 0
  const canApply = !!data && data.settings.open && fee != null && !active && !!current && short === 0
  const goneName = useMemo(() => (data?.preference && !data.preference.design_available ? data.preference.design_name || data.preference.design_id : null), [data])

  const save = async () => {
    if (!current) return
    setSaveState('busy'); setMsg(null)
    try {
      await readJson(await authFetch('/api/client/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preference', design, color, nickname: nickname.trim() }) }))
      setSaveState('done'); setMsg({ ok: true, text: t('saved') })
      load()
    } catch (e) { setSaveState('idle'); setMsg({ ok: false, text: errorText(e) }) }
  }

  const openReview = () => { key.current = newRequestKey(); setMsg(null); setReview(true) }
  const pay = async () => {
    if (paying || fee == null) return
    setPaying(true)
    try {
      const r = await readJson<{ reference?: string }>(await authFetch('/api/client/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current },
        body: JSON.stringify({ action: 'apply', design, color, nickname: nickname.trim(), expected_fee: fee, accept_terms: true, idempotency_key: key.current }),
      }))
      setReview(false); setAccept(false)
      setMsg({ ok: true, text: t('paidOk', { ref: r.reference || '' }) })
      onAccountChanged()
    } catch (e) {
      setReview(false)
      const text = errorText(e)
      setMsg({ ok: false, text: /fee has changed/i.test(text) ? t('feeChanged') : text })
    } finally { setPaying(false); load() }
  }

  if (loadErr && !data) return (
    <div className="panel p-6 text-center" data-cards-error>
      <p className="text-fg-muted">{t('loadFailed')}</p>
      <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => load()}>{t('retry')}</button>
    </div>
  )
  if (!data) return <div className="panel p-10 flex justify-center"><Spinner /></div>

  return (
    <div className="space-y-5 max-w-5xl" data-cards>
      <PageIntro title={t('title')} sub={t('subtitle')} icon={<IconCard width={20} height={20} />} />

      {msg && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-[14px] ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/[.07] text-emerald-300' : 'border-red-500/30 bg-red-500/[.07] text-red-300'}`} data-cards-msg>{msg.text}</p>
      )}

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-5">
        {/* Preview */}
        <section className="panel p-4 sm:p-5" aria-labelledby="card-preview">
          <h3 id="card-preview" className="text-[15px] font-semibold text-fg mb-3">{t('preview')}</h3>
          <CardFace color={color || current?.base_color || SWATCHES[0]} nickname={nickname.trim() || t('yourName')} label={t('preview')} design={current?.name || ''} />
          <p className="mt-3 text-[13px] text-fg-muted">{t('previewNote')}</p>
        </section>

        {/* Customise */}
        <section className="panel p-4 sm:p-5 space-y-4" aria-label={t('design')}>
          {goneName && <p className="flex gap-2 text-[13.5px] text-amber-300" data-design-gone><IconAlert width={16} height={16} className="shrink-0 mt-0.5" />{t('designGone', { name: goneName })}</p>}
          {data.designs.length === 0 ? <p className="text-fg-muted">{t('noDesigns')}</p> : (
            <>
              <fieldset>
                <legend className="text-[13px] text-fg-muted mb-2">{t('design')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {data.designs.map(d => (
                    <button key={d.id} type="button" onClick={() => { setDesign(d.id); setColor(d.base_color.toLowerCase()); setSaveState('idle') }} aria-pressed={design === d.id}
                      className={`flex items-center gap-2.5 min-h-11 rounded-xl border px-3 text-left text-[14px] transition-colors ${design === d.id ? 'border-accent bg-accent/[.08] text-fg' : 'border-ink-600 text-fg-muted hover:text-fg'}`} data-card-design={d.id}>
                      <span className="w-5 h-5 rounded-full border border-white/20 shrink-0" style={{ background: d.base_color }} aria-hidden="true" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-[13px] text-fg-muted mb-2">{t('colour')}</legend>
                <div className="flex flex-wrap gap-2.5">
                  {[...(current ? [current.base_color.toLowerCase()] : []), ...SWATCHES.filter(s => s !== current?.base_color.toLowerCase())].map((c, i) => (
                    <button key={c} type="button" onClick={() => { setColor(c); setSaveState('idle') }} aria-pressed={color === c} aria-label={i === 0 && current ? t('designColour') : c}
                      className={`w-10 h-10 rounded-full border-2 transition-transform ${color === c ? 'border-accent scale-105' : 'border-white/15'}`} style={{ background: c }} data-card-color={c} />
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="text-[13px] text-fg-muted">{t('nickname')}</span>
                <input value={nickname} onChange={e => { setNickname(cleanNick(e.target.value)); setSaveState('idle') }} maxLength={24} autoComplete="off"
                  className="input-field mt-1.5 w-full text-[16px]" placeholder={t('yourName')} data-card-nickname />
                <span className="block mt-1 text-[12px] text-fg-faint">{t('nicknameHint')}</span>
              </label>
              <button type="button" onClick={save} disabled={saveState === 'busy' || !current} className="btn btn-outline w-full sm:w-auto min-h-11" data-card-save>
                {saveState === 'busy' ? t('saving') : saveState === 'done' ? <><IconCheck width={16} height={16} />{t('saved')}</> : t('save')}
              </button>
            </>
          )}
        </section>
      </div>

      {/* Application */}
      <section className="panel p-4 sm:p-5" aria-labelledby="card-apply" data-card-apply>
        <h3 id="card-apply" className="text-[15px] font-semibold text-fg mb-3">{active ? t('yourApplication') : t('applyTitle')}</h3>
        {active ? <ApplicationRow a={active} t={t} money={money} intl={intl} detailed /> : !data.settings.open || fee == null ? (
          <p className="text-[14px] text-fg-muted" data-cards-closed>{t('closed')}</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[14px]">
              <div className="rounded-xl border border-ink-700 p-3"><dt className="text-[12px] text-fg-faint">{t('feeLabel')}</dt><dd className="text-fg font-semibold tabular-nums" data-card-fee>{money(fee)}</dd></div>
              <div className="rounded-xl border border-ink-700 p-3"><dt className="text-[12px] text-fg-faint">{t('available')}</dt><dd className="text-fg tabular-nums" data-card-available>{money(data.spendable)}</dd></div>
              {data.settings.issuer_name && <div className="rounded-xl border border-ink-700 p-3 col-span-2 sm:col-span-1"><dt className="text-[12px] text-fg-faint">{t('issuer')}</dt><dd className="text-fg truncate">{data.settings.issuer_name}</dd></div>}
            </dl>
            {short > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[.06] px-4 py-3" data-card-short>
                <p className="text-[14px] text-amber-200">{t('short', { amount: money(short) })}</p>
                <button type="button" className="btn btn-sm btn-solid" onClick={() => go('deposit')}>{t('addFunds')}</button>
              </div>
            ) : (
              <>
                {data.settings.terms && (
                  <details className="rounded-xl border border-ink-700 px-4 py-3">
                    <summary className="cursor-pointer text-[14px] text-fg">{t('terms')}</summary>
                    <p className="mt-2 text-[13.5px] text-fg-muted whitespace-pre-line">{data.settings.terms}</p>
                  </details>
                )}
                <label className="flex gap-3 items-start text-[14px] text-fg-muted">
                  <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} className="mt-1 w-5 h-5 accent-[rgb(var(--accent))]" data-card-accept />
                  <span>{t('accept')}</span>
                </label>
                <button type="button" onClick={openReview} disabled={!canApply || !accept} className="btn btn-solid w-full sm:w-auto min-h-11" data-card-review>{t('applyCta', { amount: money(fee) })}</button>
              </>
            )}
          </div>
        )}
      </section>

      {older.length > 0 && (
        <section className="panel p-4 sm:p-5" aria-labelledby="card-history">
          <h3 id="card-history" className="text-[15px] font-semibold text-fg mb-2">{t('history')}</h3>
          <ul className="divide-y divide-ink-700">{older.map(a => <li key={a.reference} className="py-3"><ApplicationRow a={a} t={t} money={money} intl={intl} /></li>)}</ul>
        </section>
      )}

      {review && fee != null && current && (
        <ConfirmModal title={t('reviewTitle')} confirmLabel={paying ? t('paying') : t('confirmPay', { amount: money(fee) })} cancelLabel={t('cancel')} busy={paying} onConfirm={pay} onCancel={() => { if (!paying) setReview(false) }}>
          <dl className="space-y-2 text-[14px]" data-card-review-sheet>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t('design')}</dt><dd className="text-fg text-right">{current.name}</dd></div>
            {nickname.trim() && <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t('nickname')}</dt><dd className="text-fg text-right break-all">{nickname.trim()}</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t('feeLabel')}</dt><dd className="text-fg font-semibold tabular-nums">{money(fee)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t('available')}</dt><dd className="text-fg tabular-nums">{money(data.spendable)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t('after')}</dt><dd className="text-fg tabular-nums">{money(Math.round((data.spendable - fee) * 100) / 100)}</dd></div>
          </dl>
          <p className="mt-3 text-[13px] text-fg-muted">{t('reviewBody')}</p>
        </ConfirmModal>
      )}
    </div>
  )
}

function ApplicationRow({ a, t, money, intl, detailed }: { a: Application; t: (k: string, v?: Record<string, string | number>) => string; money: (n: number, c?: string) => string; intl: string; detailed?: boolean }) {
  const tone = a.status === 'issued' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[.07]' : a.status === 'rejected' || a.status === 'cancelled' ? 'text-fg-muted border-ink-600' : 'text-amber-300 border-amber-500/30 bg-amber-500/[.07]'
  return (
    <div className="space-y-2" data-card-application={a.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-fg">{a.design_name}{a.nickname ? ` · ${a.nickname}` : ''}</span>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12.5px] ${tone}`}>{t(`st.${a.status}`)}</span>
      </div>
      {detailed && <p className="text-[13.5px] text-fg-muted">{t(`stb.${a.status}`, { issuer: a.issuer_name || '' })}</p>}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12.5px]">
        <div className="col-span-2 sm:col-span-1"><dt className="text-fg-faint">{t('reference')}</dt><dd className="text-fg font-mono break-all">{a.reference}</dd></div>
        <div><dt className="text-fg-faint">{t('feePaid')}</dt><dd className="text-fg tabular-nums">{money(a.fee, a.currency)}</dd></div>
        <div><dt className="text-fg-faint">{t('submitted')}</dt><dd className="text-fg">{new Date(a.created_at).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
      </dl>
    </div>
  )
}

// The visual card. No number, expiry or security code: it is a preview.
function CardFace({ color, nickname, label, design }: { color: string; nickname: string; label: string; design: string }) {
  return (
    <div className="relative w-full max-w-[420px] mx-auto aspect-[1.586] rounded-[18px] overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,.45)] border border-white/10"
      style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 45%, #0b0d12 130%)` }} data-card-face role="img" aria-label={`${design} · ${label}`}>
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,rgba(255,255,255,.18),transparent_55%)]" aria-hidden="true" />
      <div className="relative h-full flex flex-col justify-between p-[6%]">
        <div className="flex items-start justify-between">
          <span className="text-white font-semibold tracking-tight text-[clamp(14px,4vw,19px)] drop-shadow">Tarafab<span className="text-white/70">.XAi</span></span>
          <span className="rounded-full bg-black/35 border border-white/20 px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-white/90">{label}</span>
        </div>
        <div className="w-[13%] aspect-[1.3] rounded-[5px] bg-[linear-gradient(135deg,#f3dc9a,#b8913c)] border border-black/20" aria-hidden="true" />
        <div className="flex items-end justify-between gap-3">
          <span className="text-white/95 text-[clamp(13px,3.6vw,17px)] font-medium tracking-wide truncate">{nickname}</span>
          <span className="text-white/70 text-[11px] uppercase tracking-[0.12em] shrink-0">{design}</span>
        </div>
      </div>
    </div>
  )
}

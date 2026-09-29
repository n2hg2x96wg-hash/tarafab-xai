'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { IconChart, IconClose, IconInfo, IconPie, IconShield, IconTrend } from '@/components/Icons'
import { fmt } from '@/components/dashboard/shared'

// The client's Investment Center. Everything shown is read from real records
// through /api/client/investments, which runs under row level security.
//
// Each figure has one defined source and nothing is estimated:
//   invested principal  sum of principal of the client's active investments
//   realised returns    completed "return" ledger rows linked to an investment
//   current value       not recorded anywhere yet, so shown as unavailable
//   return %            only when both principal and realised returns exist
//
// Investing is not enabled: there is no endpoint that creates an investment,
// and the interface says so instead of offering a button that cannot work.

type Version = {
  id: string; product_id: string; version: number; name: string; description: string; currency: string
  min_amount: number; max_amount: number | null; term_days: number | null; risk_level: 'low' | 'medium' | 'high'
  risk_disclosure: string; terms_text: string; entry_fee_pct: number; return_type: 'none' | 'fixed_rate'
  return_rate_pct: number | null; eligibility: { kyc_required?: boolean }; published_at: string | null
}
type Product = { id: string; code: string; status: string; current_version_id: string | null }
type Investment = {
  id: string; product_id: string; product_version_id: string; principal: number; fee_amount: number; currency: string
  status: string; start_date: string | null; maturity_date: string | null; created_at: string
}
type Data = { products: Product[]; versions: Version[]; investments: Investment[]; returns: { client_investment_id: string; amount: number }[]; kyc_verified: boolean; investing_enabled: boolean }

const RISK_TONE = {
  low: 'text-success-300 border-success-500/30 bg-success-500/[0.07]',
  medium: 'text-warning-300 border-warning-500/30 bg-warning-500/[0.07]',
  high: 'text-danger-300 border-danger-400/40 bg-danger-400/[0.07]',
}
const LIVE = ['pending_activation', 'active']
const money = (n: number) => `$${fmt(n)}`

export function InvestmentCenter({ go }: { go: (id: string) => void }) {
  const { t, intl } = useI18n()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Version | null>(null)
  const [openInv, setOpenInv] = useState<Investment | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const raw = await readJson<Partial<Data>>(await authFetch('/api/client/investments'))
      // A reply of the wrong shape is treated as a failure, not rendered: it
      // must never crash the page or be shown as if it were empty data.
      if (![raw.products, raw.versions, raw.investments, raw.returns].every(Array.isArray)) throw new Error('malformed')
      setData({ products: raw.products!, versions: raw.versions!, investments: raw.investments!, returns: raw.returns!, kyc_verified: raw.kyc_verified === true, investing_enabled: false })
    }
    catch (e) { setError(errorText(e, t)) }
  }, [t])
  useEffect(() => { load() }, [load])

  const versionById = useMemo(() => new Map((data?.versions || []).map(v => [v.id, v])), [data])
  const offers = useMemo(() => (data?.products || [])
    .map(p => p.current_version_id ? versionById.get(p.current_version_id) : undefined)
    .filter((v): v is Version => !!v), [data, versionById])
  const live = (data?.investments || []).filter(i => LIVE.includes(i.status))
  const principal = live.reduce((s, i) => s + Number(i.principal), 0)
  const realised = (data?.returns || []).reduce((s, r) => s + r.amount, 0)
  const hasInvestments = (data?.investments.length || 0) > 0
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')

  if (error) {
    return (
      <div role="alert" className="panel p-6 text-center">
        <p className="text-fg font-medium">{t('inv.loadFailed')}</p>
        <p className="text-sm text-fg-muted mt-1 mb-4">{error}</p>
        <button onClick={load} className="btn btn-outline btn-sm">{t('common.tryAgain')}</button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4" role="status" aria-label={t('common.loading')}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="panel p-4 space-y-2"><div className="skeleton h-3 w-20" /><div className="skeleton h-6 w-24" /></div>)}</div>
        <div className="panel p-5 space-y-3"><div className="skeleton h-4 w-40" /><div className="skeleton h-24" /></div>
      </div>
    )
  }

  const stats: { label: TKey; value: string; hint: TKey; muted?: boolean }[] = [
    { label: 'inv.principal', value: money(principal), hint: 'inv.principalHint' },
    { label: 'inv.activeCount', value: String(live.length), hint: 'inv.activeCountHint' },
    { label: 'inv.realised', value: hasInvestments ? money(realised) : '—', hint: 'inv.realisedHint', muted: !hasInvestments },
    { label: 'inv.currentValue', value: t('inv.notAvailable'), hint: 'inv.currentValueHint', muted: true },
  ]

  return (
    <div className="space-y-6">
      <section aria-labelledby="inv-title">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 id="inv-title" className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('inv.title')}</h2>
            <p className="text-sm text-fg-faint mt-0.5">{t('inv.subtitle')}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="panel p-4 min-w-0" title={t(s.hint)}>
              <dt className="text-[12px] text-fg-faint truncate">{t(s.label)}</dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums truncate ${s.muted ? 'text-fg-muted' : 'text-fg'}`}>{s.value}</dd>
              <p className="mt-1 text-[11px] leading-snug text-fg-faint line-clamp-2">{t(s.hint)}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* Active investments */}
      <section className="panel overflow-hidden" aria-labelledby="inv-active">
        <div className="px-5 py-4 border-b border-ink-700"><h3 id="inv-active" className="text-[15px] font-semibold text-fg">{t('inv.active')}</h3></div>
        {hasInvestments ? (
          <ul className="divide-y divide-ink-700">
            {data.investments.map(i => {
              const v = versionById.get(i.product_version_id)
              return (
                <li key={i.id}>
                  <button onClick={() => setOpenInv(i)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-ink-850 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{v?.name || t('inv.product')}</p>
                      <p className="text-xs text-fg-faint">{t('inv.startsEnds', { start: date(i.start_date), end: date(i.maturity_date) })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-fg tabular-nums">{money(Number(i.principal))}</p>
                      <p className="text-xs text-fg-faint">{t(`inv.status.${i.status}` as TKey)}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto mb-3 w-11 h-11 rounded-xl border border-ink-700 flex items-center justify-center text-fg-faint"><IconPie width={20} height={20} /></span>
            <p className="text-fg font-medium">{t('inv.noActive')}</p>
            <p className="text-sm text-fg-muted mt-1 max-w-sm mx-auto">{t('inv.noActiveBody')}</p>
            <a href="#inv-products" className="btn btn-outline btn-sm mt-4">{t('inv.explore')}</a>
          </div>
        )}
      </section>

      {/* Performance: only ever drawn from recorded valuations, which do not exist yet */}
      <section className="panel p-5" aria-labelledby="inv-perf">
        <h3 id="inv-perf" className="text-[15px] font-semibold text-fg">{t('inv.performance')}</h3>
        <div className="mt-4 h-40 rounded-xl border border-dashed border-ink-600 flex flex-col items-center justify-center text-center px-6">
          <IconTrend width={20} height={20} className="text-fg-faint mb-2" aria-hidden="true" />
          <p className="text-sm text-fg-muted max-w-sm">{t('inv.performanceEmpty')}</p>
        </div>
      </section>

      {/* Products */}
      <section id="inv-products" className="scroll-mt-20" aria-labelledby="inv-products-title">
        <h3 id="inv-products-title" className="text-[15px] font-semibold text-fg mb-3">{t('inv.products')}</h3>
        {offers.length === 0 ? (
          <div className="panel px-5 py-10 text-center">
            <span className="mx-auto mb-3 w-11 h-11 rounded-xl border border-ink-700 flex items-center justify-center text-fg-faint"><IconChart width={20} height={20} /></span>
            <p className="text-fg font-medium">{t('inv.noProducts')}</p>
            <p className="text-sm text-fg-muted mt-1 max-w-sm mx-auto">{t('inv.noProductsBody')}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {offers.map(v => (
              <article key={v.id} className="panel panel-lift p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-semibold text-fg">{v.name}</h4>
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${RISK_TONE[v.risk_level]}`}>{t(`inv.risk.${v.risk_level}` as TKey)}</span>
                </div>
                <p className="text-sm text-fg-muted mt-1 line-clamp-2">{v.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-fg-faint">{t('inv.minimum')}</dt><dd className="text-fg text-right tabular-nums">{money(Number(v.min_amount))}</dd>
                  <dt className="text-fg-faint">{t('inv.duration')}</dt><dd className="text-fg text-right">{v.term_days ? t('inv.days', { n: v.term_days }) : t('inv.openEnded')}</dd>
                  <dt className="text-fg-faint">{t('inv.fee')}</dt><dd className="text-fg text-right tabular-nums">{Number(v.entry_fee_pct) ? `${(Number(v.entry_fee_pct) * 100).toFixed(2)}%` : t('inv.noFee')}</dd>
                </dl>
                <button onClick={() => setOpen(v)} className="btn btn-outline btn-sm mt-5 self-start">{t('inv.viewDetails')}</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {open && <ProductDetail v={open} kycVerified={data.kyc_verified} onClose={() => setOpen(null)} go={go} />}
      {openInv && <InvestmentDetail inv={openInv} v={versionById.get(openInv.product_version_id)} returns={data.returns.filter(r => r.client_investment_id === openInv.id)} onClose={() => setOpenInv(null)} />}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] backdrop-in" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto overscroll-contain glass-panel rounded-t-2xl sm:rounded-2xl rise-in safe-bottom">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 sm:px-6 h-14 border-b border-ink-700 glass-bar">
          <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
          <button onClick={onClose} className="-mr-2 w-10 h-10 rounded-md flex items-center justify-center text-fg-muted hover:text-fg" aria-label={t('common.closeMenu')}><IconClose /></button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

function ProductDetail({ v, kycVerified, onClose, go }: { v: Version; kycVerified: boolean; onClose: () => void; go: (id: string) => void }) {
  const { t } = useI18n()
  const kycRequired = v.eligibility?.kyc_required !== false
  const rows: [TKey, string][] = [
    ['inv.range', v.max_amount ? `${money(Number(v.min_amount))} – ${money(Number(v.max_amount))}` : t('inv.fromAmount', { amount: money(Number(v.min_amount)) })],
    ['inv.currency', v.currency],
    ['inv.duration', v.term_days ? t('inv.days', { n: v.term_days }) : t('inv.openEnded')],
    ['inv.fee', Number(v.entry_fee_pct) ? `${(Number(v.entry_fee_pct) * 100).toFixed(2)}%` : t('inv.noFee')],
    ['inv.statedReturn', v.return_type === 'fixed_rate' && v.return_rate_pct !== null ? t('inv.fixedRate', { rate: Number(v.return_rate_pct).toFixed(2) }) : t('inv.noStatedReturn')],
    ['inv.riskLabel', t(`inv.risk.${v.risk_level}` as TKey)],
    ['inv.termsVersion', t('inv.versionN', { n: v.version })],
  ]
  return (
    <Sheet title={v.name} onClose={onClose}>
      <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.description}</p>
      <dl className="mt-5 divide-y divide-ink-700 text-sm">
        {rows.map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-fg-faint">{t(k)}</dt><dd className="text-fg text-right">{val}</dd></div>)}
      </dl>
      {v.return_type === 'fixed_rate' && <p className="mt-2 text-xs text-fg-faint">{t('inv.statedReturnNote')}</p>}

      <h3 className="mt-6 text-sm font-semibold text-fg flex items-center gap-2"><IconAlert />{t('inv.riskDisclosure')}</h3>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.risk_disclosure}</p>
      <h3 className="mt-5 text-sm font-semibold text-fg">{t('inv.terms')}</h3>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.terms_text}</p>

      <div className="mt-6 rounded-xl border border-ink-700 p-4 space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <IconShield width={16} height={16} className={`shrink-0 mt-0.5 ${!kycRequired || kycVerified ? 'text-success-400' : 'text-warning-400'}`} aria-hidden="true" />
          <span className="text-fg-muted">{!kycRequired ? t('inv.eligibleNoKyc') : kycVerified ? t('inv.eligibleKyc') : t('inv.needsKyc')}</span>
        </p>
        {kycRequired && !kycVerified && <button onClick={() => { onClose(); go('verification') }} className="btn btn-outline btn-sm">{t('overview.kycStart')}</button>}
        <p className="flex items-start gap-2 text-sm text-fg-muted border-t border-ink-700 pt-3">
          <IconInfo width={16} height={16} className="shrink-0 mt-0.5 text-fg-faint" aria-hidden="true" />
          {t('inv.notOpenYet')}
        </p>
      </div>
    </Sheet>
  )
}

function IconAlert() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-warning-400" aria-hidden="true"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
}

function InvestmentDetail({ inv, v, returns, onClose }: { inv: Investment; v?: Version; returns: { amount: number }[]; onClose: () => void }) {
  const { t, intl } = useI18n()
  const realised = returns.reduce((s, r) => s + r.amount, 0)
  const pct = Number(inv.principal) > 0 && returns.length ? (realised / Number(inv.principal)) * 100 : null
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  const rows: [TKey, string][] = [
    ['inv.reference', inv.id.slice(0, 8).toUpperCase()],
    ['inv.product', v ? `${v.name} · ${t('inv.versionN', { n: v.version })}` : t('inv.notSet')],
    ['inv.principal', money(Number(inv.principal))],
    ['inv.fee', money(Number(inv.fee_amount))],
    ['inv.realised', money(realised)],
    ['inv.returnPct', pct === null ? '—' : `${pct.toFixed(2)}%`],
    ['inv.currentValue', t('inv.notAvailable')],
    ['inv.statusLabel', t(`inv.status.${inv.status}` as TKey)],
    ['inv.start', date(inv.start_date)],
    ['inv.maturity', date(inv.maturity_date)],
  ]
  return (
    <Sheet title={v?.name || t('inv.product')} onClose={onClose}>
      <dl className="divide-y divide-ink-700 text-sm">
        {rows.map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-fg-faint">{t(k)}</dt><dd className="text-fg text-right tabular-nums">{val}</dd></div>)}
      </dl>
    </Sheet>
  )
}

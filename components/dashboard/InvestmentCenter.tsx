'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { IconChart, IconClose, IconPie, IconShield, IconTrend } from '@/components/Icons'
import { fmt } from '@/components/dashboard/shared'
import { projection } from '@/lib/returns'

// The client's Investment Center. Everything shown is read from real records
// through /api/client/investments, which runs under row level security.
//
// Each figure has one defined source and nothing is estimated:
//   invested principal  sum of principal of the client's active investments
//   pending             requests awaiting review; their amount is held in the
//                       account's existing pending balance
//   recorded returns    completed "return" ledger rows linked to an investment
//   available balance   the account's own available_balance, never computed here
//
// Submitting and cancelling go through POST /api/client/investments, whose
// database functions re-check KYC, product status, limits and the balance.

type Version = {
  id: string; product_id: string; version: number; name: string; description: string; currency: string
  min_amount: number; max_amount: number | null; term_days: number | null; return_amount?: number | null; duration_value?: number | null; duration_unit?: 'days' | 'weeks' | 'months' | 'years' | null
  cancellation_allowed?: boolean; cancellation_terms?: string | null; risk_level: 'low' | 'medium' | 'high'
  risk_disclosure: string; terms_text: string; entry_fee_pct: number; return_type: 'none' | 'fixed_rate' | 'fixed_amount'
  return_rate_pct: number | null; eligibility: { kyc_required?: boolean }; published_at: string | null
}
type Product = { id: string; code: string; status: string; current_version_id: string | null }
type Investment = {
  id: string; reference?: string | null; product_id: string; product_version_id: string; principal: number; fee_amount: number; profit_amount?: number | null; return_type?: string; return_rate_pct?: number | null; return_amount?: number | null; expected_return?: number | null; expected_total?: number | null; currency: string
  status: string; start_date: string | null; maturity_date: string | null; completed_at?: string | null; rejection_reason?: string | null; reviewed_at?: string | null; created_at: string
}
type Ev = { id: number; client_investment_id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }
type LinkedTx = { client_investment_id: string; kind: string; tx: { id: string; type: string; amount: number; status: string; reference: string | null; created_at: string } | null }
type Adj = { id: string; investment_id: string; previous_profit: number; new_profit: number; previous_value: number; new_value: number; reason: string; created_at: string }
type Balance = { available: number; pending: number; invested: number }
type Data = {
  products: Product[]; versions: Version[]; investments: Investment[]; returns: { client_investment_id: string; amount: number }[]
  events: Ev[]; transactions: LinkedTx[]; adjustments: Adj[]; balance: Balance | null; kyc_verified: boolean; investing_enabled: boolean
}

const RISK_TONE = {
  low: 'text-success-300 border-success-500/30 bg-success-500/[0.07]',
  medium: 'text-warning-300 border-warning-500/30 bg-warning-500/[0.07]',
  high: 'text-danger-300 border-danger-400/40 bg-danger-400/[0.07]',
}
const STATUS_TONE: Record<string, string> = {
  pending_activation: 'text-warning-300 border-warning-500/30 bg-warning-500/[0.07]',
  active: 'text-success-300 border-success-500/30 bg-success-500/[0.07]',
  rejected: 'text-danger-300 border-danger-400/40 bg-danger-400/[0.07]',
}
const money = (n: number) => `$${fmt(n)}`
// Each investment's own recorded profit / return (0 when none is recorded).
export const profitOf = (i: { profit_amount?: number | null }) => Number(i.profit_amount || 0)
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${fmt(Math.abs(n))}`
export const pctOf = (profit: number, principal: number) => principal > 0 ? `${profit > 0 ? '+' : profit < 0 ? '−' : ''}${Math.abs((profit / principal) * 100).toFixed(2)}%` : '—'
const UNIT_KEY = { days: 'inv.f.dDays', weeks: 'inv.f.dWeeks', months: 'inv.f.dMonths', years: 'inv.f.dYears' } as const
type T = ReturnType<typeof useI18n>['t']
const durationText = (v: Version, t: T) =>
  v.duration_value && v.duration_unit ? t(UNIT_KEY[v.duration_unit], { n: v.duration_value }) : v.term_days ? t('inv.days', { n: v.term_days }) : t('inv.openEnded')
const feeText = (v: Version, t: T) => Number(v.entry_fee_pct) ? `${(Number(v.entry_fee_pct) * 100).toFixed(2)}%` : t('inv.noFee')

// Return terms of one investment, from the snapshot taken when it was made.
const returnTermsText = (i: { return_type?: string; return_rate_pct?: number | null; return_amount?: number | null }, t: T) =>
  i.return_type === 'fixed_rate' && i.return_rate_pct != null ? `${Number(i.return_rate_pct)}%`
  : i.return_type === 'fixed_amount' && i.return_amount != null ? t('inv.f.fixedAmount', { amount: money(Number(i.return_amount)) })
  : '—'

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_TONE[status] || 'text-fg-muted border-ink-600'}`}>{t(`inv.status.${status}` as TKey)}</span>
}

type Filter = 'all' | 'active' | 'pending' | 'completed'
const FILTERS: [Filter, TKey][] = [['all', 'inv.f.filterAll'], ['active', 'inv.status.active'], ['pending', 'inv.f.filterPending'], ['completed', 'inv.f.filterClosed']]
const matches = (f: Filter, status: string) =>
  f === 'all' ? true : f === 'active' ? status === 'active'
  : f === 'pending' ? status === 'pending_activation' || status === 'approved'
  : !['active', 'pending_activation', 'approved'].includes(status)

export function InvestmentCenter({ go, focusId, onFocusDone }: { go: (id: string) => void; focusId?: string | null; onFocusDone?: () => void }) {
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
      const b = raw.balance
      setData({
        products: raw.products!, versions: raw.versions!, investments: raw.investments!, returns: raw.returns!,
        events: Array.isArray(raw.events) ? raw.events : [], adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [], transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
        balance: b && Number.isFinite(Number(b.available)) ? { available: Number(b.available), pending: Number(b.pending), invested: Number(b.invested) } : null,
        kyc_verified: raw.kyc_verified === true, investing_enabled: raw.investing_enabled === true,
      })
    }
    catch (e) { setError(errorText(e, t)) }
  }, [t])
  useEffect(() => { load() }, [load])
  // Open a specific investment when asked to (notification button or deep link).
  // Only an investment in the client's own list can be opened.
  useEffect(() => {
    if (!focusId || !data) return
    const mine = data.investments.find(i => i.id.toLowerCase() === focusId.toLowerCase())
    if (mine) setOpenInv(mine)
    onFocusDone?.()
  }, [focusId, data, onFocusDone])

  const versionById = useMemo(() => new Map((data?.versions || []).map(v => [v.id, v])), [data])
  const offers = useMemo(() => (data?.products || [])
    .map(p => p.current_version_id ? versionById.get(p.current_version_id) : undefined)
    .filter((v): v is Version => !!v), [data, versionById])
  const invs = data?.investments || []
  const active = invs.filter(i => i.status === 'active')
  const pending = invs.filter(i => i.status === 'pending_activation')
  const principal = active.reduce((s, i) => s + Number(i.principal), 0)
  const held = pending.reduce((s, i) => s + Number(i.principal), 0)
  const realised = invs.reduce((s, i) => s + profitOf(i), 0)
  const activeValue = active.reduce((s, i) => s + Number(i.principal) + profitOf(i), 0)
  const hasInvestments = invs.length > 0
  const [filter, setFilter] = useState<Filter>('all')
  const shown = invs.filter(x => matches(filter, x.status))
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')

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
    { label: 'inv.activeCount', value: String(active.length), hint: 'inv.activeCountHint' },
    { label: 'inv.f.pendingCount', value: pending.length ? `${pending.length} · ${money(held)}` : '0', hint: 'inv.f.pendingHint', muted: !pending.length },
    { label: 'inv.f.currentValue', value: money(activeValue), hint: 'inv.f.currentValueHint', muted: !active.length },
    { label: 'inv.f.profit', value: signed(realised), hint: 'inv.f.profitHint', muted: realised === 0 },
  ]

  return (
    <div className="space-y-6">
      <section aria-labelledby="inv-title">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 id="inv-title" className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('inv.title')}</h2>
            <p className="text-sm text-fg-faint mt-0.5">{t('inv.subtitle')}</p>
          </div>
          {data.balance && <p className="text-sm text-fg-muted">{t('inv.f.available')}: <span className="text-fg font-semibold tabular-nums">{money(data.balance.available)}</span></p>}
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {stats.map(s => (
            <div key={s.label} className="panel p-4 min-w-0" title={t(s.hint)}>
              <dt className="text-[12px] text-fg-faint truncate">{t(s.label)}</dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums truncate ${s.muted ? 'text-fg-muted' : 'text-fg'}`}>{s.value}</dd>
              <p className="mt-1 text-[11px] leading-snug text-fg-faint line-clamp-2">{t(s.hint)}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* Available plans */}
      <section id="inv-products" className="scroll-mt-20" aria-labelledby="inv-products-title">
        <h3 id="inv-products-title" className="text-[15px] font-semibold text-fg mb-3">{t('inv.f.plans')}</h3>
        {offers.length === 0 ? (
          <div className="panel px-5 py-10 text-center">
            <span className="mx-auto mb-3 w-11 h-11 rounded-xl border border-ink-700 flex items-center justify-center text-fg-faint"><IconChart width={20} height={20} /></span>
            <p className="text-fg font-medium">{t('inv.f.noPlans')}</p>
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
                  <dt className="text-fg-faint">{t('inv.duration')}</dt><dd className="text-fg text-right">{durationText(v, t)}</dd>
                  <dt className="text-fg-faint">{t('inv.fee')}</dt><dd className="text-fg text-right tabular-nums">{feeText(v, t)}</dd>
                </dl>
                <button onClick={() => setOpen(v)} className="btn btn-solid btn-sm mt-5 self-start">{t('inv.viewDetails')}</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* My investments: every status, nothing hidden or deleted */}
      <section className="panel overflow-hidden" aria-labelledby="inv-mine">
        <div className="px-5 py-4 border-b border-ink-700 flex items-center justify-between gap-3">
          <h3 id="inv-mine" className="text-[15px] font-semibold text-fg">{t('inv.f.myInvestments')}</h3>
          {hasInvestments && active.length === 0 && <span className="text-xs text-fg-faint">{t('inv.f.noActive')}</span>}
        </div>
        {hasInvestments && (
          <div className="px-5 pt-3 flex gap-1.5 overflow-x-auto" role="tablist" aria-label={t('inv.f.myInvestments')}>
            {FILTERS.map(([id, label]) => {
              const n = invs.filter(x => matches(id, x.status)).length
              return (
                <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                  className={`shrink-0 min-h-9 px-3 rounded-full border text-[12.5px] transition-colors ${filter === id ? 'border-accent/50 bg-accent/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg'}`}>
                  {t(label)} <span className="tabular-nums text-fg-faint">{n}</span>
                </button>
              )
            })}
          </div>
        )}
        {hasInvestments && shown.length === 0 && <p className="px-5 py-8 text-center text-sm text-fg-muted">{t('inv.f.noneInFilter')}</p>}
        {hasInvestments ? (
          <ul className="divide-y divide-ink-700">
            {shown.map(i => {
              const v = versionById.get(i.product_version_id)
              return (
                <li key={i.id}>
                  <button onClick={() => setOpenInv(i)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-ink-850 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{v?.name || t('inv.product')}</p>
                      <p className="text-xs text-fg-faint truncate">
                        {i.reference ? `${i.reference} · ` : ''}
                        {i.status === 'active' || i.status === 'completed' ? t('inv.startsEnds', { start: date(i.start_date), end: date(i.maturity_date) }) : `${t('inv.f.submitted')} ${date(i.created_at)}`}
                      </p>
                      {i.status === 'rejected' && i.rejection_reason && <p className="text-xs text-danger-300 mt-0.5 line-clamp-2">{t('inv.f.rejectionReason')}: {i.rejection_reason}</p>}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-sm font-semibold text-fg tabular-nums">{money(Number(i.principal) + (['active', 'completed', 'matured'].includes(i.status) ? profitOf(i) : 0))}</p>
                      {['active', 'completed', 'matured'].includes(i.status) && <p className={`text-[11px] tabular-nums ${profitOf(i) > 0 ? 'price-up' : profitOf(i) < 0 ? 'price-down' : 'text-fg-faint'}`}>{signed(profitOf(i))} · {pctOf(profitOf(i), Number(i.principal))}</p>}
                      <StatusBadge status={i.status} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto mb-3 w-11 h-11 rounded-xl border border-ink-700 flex items-center justify-center text-fg-faint"><IconPie width={20} height={20} /></span>
            <p className="text-fg font-medium">{t('inv.f.noInvestments')}</p>
            {offers.length > 0 && <a href="#inv-products" className="btn btn-outline btn-sm mt-4">{t('inv.explore')}</a>}
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

      {open && <ProductDetail v={open} kycVerified={data.kyc_verified} balance={data.balance} onClose={() => setOpen(null)} onSubmitted={load} go={go} />}
      {openInv && (
        <InvestmentDetail inv={openInv} v={versionById.get(openInv.product_version_id)}
          adjustments={data.adjustments.filter(a => a.investment_id === openInv.id)}
          events={data.events.filter(e => e.client_investment_id === openInv.id)}
          txs={data.transactions.filter(x => x.client_investment_id === openInv.id)}
          onClose={() => setOpenInv(null)} onChanged={() => { setOpenInv(null); load() }} />
      )}
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

function ProductDetail({ v, kycVerified, balance, onClose, onSubmitted, go }: { v: Version; kycVerified: boolean; balance: Balance | null; onClose: () => void; onSubmitted: () => void; go: (id: string) => void }) {
  const { t } = useI18n()
  const [step, setStep] = useState<'details' | 'invest' | 'done'>('details')
  const kycRequired = v.eligibility?.kyc_required !== false
  const eligible = !kycRequired || kycVerified
  const rows: [TKey, string][] = [
    ['inv.range', v.max_amount ? `${money(Number(v.min_amount))} – ${money(Number(v.max_amount))}` : t('inv.fromAmount', { amount: money(Number(v.min_amount)) })],
    ['inv.currency', v.currency],
    ['inv.duration', durationText(v, t)],
    ['inv.fee', feeText(v, t)],
    ['inv.statedReturn', v.return_type === 'fixed_rate' && v.return_rate_pct !== null ? t('inv.fixedRate', { rate: Number(v.return_rate_pct).toFixed(2) }) : v.return_type === 'fixed_amount' && v.return_amount != null ? t('inv.f.fixedAmount', { amount: money(Number(v.return_amount)) }) : t('inv.noStatedReturn')],
    ['inv.riskLabel', t(`inv.risk.${v.risk_level}` as TKey)],
    ['inv.termsVersion', t('inv.versionN', { n: v.version })],
  ]
  if (step === 'invest') return <Sheet title={t('inv.f.investIn', { name: v.name })} onClose={onClose}><InvestForm v={v} balance={balance} onBack={() => setStep('details')} onDone={() => { setStep('done'); onSubmitted() }} /></Sheet>
  if (step === 'done') {
    return (
      <Sheet title={v.name} onClose={onClose}>
        <div className="text-center py-6" role="status">
          <span className="mx-auto mb-3 w-12 h-12 rounded-full border border-success-500/30 bg-success-500/[0.07] flex items-center justify-center text-success-300"><IconShield width={22} height={22} /></span>
          <p className="text-lg font-semibold text-fg">{t('inv.f.submittedTitle')}</p>
          <p className="text-sm text-fg-muted mt-2 max-w-sm mx-auto">{t('inv.f.submittedBody')}</p>
          <button onClick={onClose} className="btn btn-solid mt-6">{t('inv.f.done')}</button>
        </div>
      </Sheet>
    )
  }
  return (
    <Sheet title={v.name} onClose={onClose}>
      <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.description}</p>
      <dl className="mt-5 divide-y divide-ink-700 text-sm">
        {rows.map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-fg-faint">{t(k)}</dt><dd className="text-fg text-right">{val}</dd></div>)}
      </dl>
      {v.return_type !== 'none' && <p className="mt-2 text-xs text-fg-faint">{t('inv.f.projectedOnProduct')}</p>}

      <h3 className="mt-6 text-sm font-semibold text-fg flex items-center gap-2"><IconAlert />{t('inv.riskDisclosure')}</h3>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.risk_disclosure}</p>
      <h3 className="mt-5 text-sm font-semibold text-fg">{t('inv.terms')}</h3>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.terms_text}</p>
      <h3 className="mt-5 text-sm font-semibold text-fg">{t('inv.f.cancellation')}</h3>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.cancellation_allowed && v.cancellation_terms ? v.cancellation_terms : t('inv.f.cancellationNotAllowed')}</p>

      <div className="mt-6 rounded-xl border border-ink-700 p-4 space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <IconShield width={16} height={16} className={`shrink-0 mt-0.5 ${eligible ? 'text-success-400' : 'text-warning-400'}`} aria-hidden="true" />
          <span className="text-fg-muted">{!kycRequired ? t('inv.eligibleNoKyc') : kycVerified ? t('inv.eligibleKyc') : t('inv.needsKyc')}</span>
        </p>
        {!eligible && <button onClick={() => { onClose(); go('verification') }} className="btn btn-outline btn-sm">{t('overview.kycStart')}</button>}
      </div>
      <div className="sticky bottom-0 -mx-5 sm:-mx-6 mt-6 px-5 sm:px-6 py-3 glass-bar border-t border-ink-700">
        <button disabled={!eligible} onClick={() => setStep('invest')} className="btn btn-solid w-full">{eligible ? t('inv.f.invest') : t('inv.f.kycFirst')}</button>
      </div>
    </Sheet>
  )
}

// Amount entry and confirmation. The checks here only help the client; the
// database function repeats every one of them against the real balance.
function InvestForm({ v, balance, onBack, onDone }: { v: Version; balance: Balance | null; onBack: () => void; onDone: () => void }) {
  const { t } = useI18n()
  const [amount, setAmount] = useState('')
  const [accept, setAccept] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // One key per attempt: a double tap or network retry reuses it, so the
  // server returns the same request instead of creating a second one.
  const key = useRef(newRequestKey())
  const n = Number(amount)
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && n > 0
  const fee = valid ? Math.round(n * Number(v.entry_fee_pct) * 100) / 100 : 0
  // Same formula the database uses; the stored figure always comes from the server.
  const proj = valid ? projection(amount.trim(), v.entry_fee_pct, { type: v.return_type, ratePct: v.return_rate_pct, amount: v.return_amount }) : null
  const projRet = proj?.profit ?? 0
  const available = balance?.available ?? null
  const problem =
    !amount ? '' :
    !valid ? t('inv.f.errAmount') :
    n < Number(v.min_amount) ? t('inv.f.errMin', { amount: money(Number(v.min_amount)) }) :
    v.max_amount !== null && n > Number(v.max_amount) ? t('inv.f.errMax', { amount: money(Number(v.max_amount)) }) :
    available !== null && n > available ? t('inv.f.errBalance') : ''

  const submit = async () => {
    if (busy) return
    if (!accept) { setErr(t('inv.f.errTerms')); return }
    if (!valid || problem) return
    setBusy(true); setErr('')
    try {
      await readJson(await authFetch('/api/client/investments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current },
        body: JSON.stringify({ action: 'submit', version_id: v.id, amount: amount.trim(), accept_terms: true, idempotency_key: key.current }),
      }))
      onDone()
    } catch (e) {
      setErr(errorText(e))
      key.current = newRequestKey()
    } finally { setBusy(false) }
  }
  const row = (k: TKey, val: string, strong = false, note?: string) => (
    <div className="py-2.5">
      <div className="flex justify-between gap-4"><dt className="text-fg-faint">{t(k)}</dt><dd className={`text-right tabular-nums ${strong ? 'text-fg font-semibold' : 'text-fg'}`}>{val}</dd></div>
      {note && <p className="mt-0.5 text-[11px] text-fg-faint">{note}</p>}
    </div>
  )

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="block text-sm text-fg-muted mb-1.5">{t('inv.f.investmentAmount')} (USD)</span>
        <input className="input-field text-lg tabular-nums" inputMode="decimal" autoFocus value={amount} onChange={e => { setAmount(e.target.value.replace(',', '.')); setErr('') }} placeholder={String(Number(v.min_amount))} aria-invalid={!!problem} />
        <span className="block text-xs text-fg-faint mt-1.5">{v.max_amount ? t('inv.f.limitsRange', { min: money(Number(v.min_amount)), max: money(Number(v.max_amount)) }) : t('inv.f.limitsMin', { min: money(Number(v.min_amount)) })}</span>
        {problem && <span role="alert" className="block text-xs text-danger-300 mt-1">{problem}</span>}
      </label>
      {/* Order follows the money: what is available, what is committed, the
          fee, the principal that is invested, and what stays available. */}
      <dl className="divide-y divide-ink-700 text-sm rounded-xl border border-ink-700 px-4">
        {row('inv.product', `${v.name} · ${t('inv.versionN', { n: v.version })}`)}
        {row('inv.f.available', available === null ? '—' : money(available), false, t('inv.f.availableNote'))}
        {row('inv.f.investmentAmount', valid ? money(n) : '—')}
        {row('inv.f.kFee', valid ? `${Number(v.entry_fee_pct) ? '−' : ''}${money(fee)}` : '—', false, Number(v.entry_fee_pct) ? `${feeText(v, t)} · ${t('inv.f.feeNote')}` : undefined)}
        {row('inv.f.principalAfter', valid ? money(Math.round((n - fee) * 100) / 100) : '—', true)}
        {row('inv.duration', durationText(v, t))}
      </dl>
      {v.return_type !== 'none' && valid && (
        <p className="text-xs text-fg-muted rounded-xl border border-ink-700 px-4 py-2.5">{t('inv.f.expectedForAmount', { ret: money(projRet), total: money(proj?.total ?? 0) })} · {t('inv.f.projectedOnProduct')}</p>
      )}
      <div className="rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-3">
        <div className="flex justify-between gap-4 text-sm"><span className="text-fg-muted">{t('inv.f.remainingAvailable')}</span><span className="text-fg font-semibold tabular-nums">{available === null || !valid ? '—' : money(Math.max(0, Math.round((available - n) * 100) / 100))}</span></div>
        <p className="mt-1.5 text-xs text-fg-faint leading-relaxed">{t('inv.f.remainingNote')}</p>
      </div>
      <label className="flex items-start gap-3 text-sm text-fg-muted cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0" checked={accept} onChange={e => { setAccept(e.target.checked); setErr('') }} />
        <span>{t('inv.f.accept', { n: v.version })}</span>
      </label>
      {err && <p role="alert" className="text-sm text-danger-300">{err}</p>}
      <div className="flex gap-3">
        <button onClick={onBack} disabled={busy} className="btn btn-outline flex-1">{t('inv.f.back')}</button>
        <button onClick={submit} disabled={busy || !valid || !!problem || !accept} className="btn btn-solid flex-1">{busy ? t('inv.f.submitting') : t('inv.f.confirm')}</button>
      </div>
    </div>
  )
}

function IconAlert() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-warning-400" aria-hidden="true"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
}

const KIND_KEY: Record<string, TKey> = { principal_in: 'inv.f.kPrincipal', fee: 'inv.f.kFee', principal_out: 'inv.f.kPrincipalOut', return: 'inv.f.kReturn' }

function InvestmentDetail({ inv, v, adjustments, events, txs, onClose, onChanged }: { inv: Investment; v?: Version; adjustments: Adj[]; events: Ev[]; txs: LinkedTx[]; onClose: () => void; onChanged: () => void }) {
  const { t, intl } = useI18n()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const principal = Number(inv.principal)
  const running = ['active', 'completed', 'matured'].includes(inv.status)
  const profit = running ? profitOf(inv) : 0
  const tone = profit > 0 ? 'price-up' : profit < 0 ? 'price-down' : 'text-fg'
  const expRet = Number(inv.expected_return || 0), expTotal = Number(inv.expected_total || 0)
  const hasProjection = inv.return_type !== undefined && inv.return_type !== 'none' && expRet > 0
  const dt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(intl, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('inv.notSet')
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  const rows: [TKey, React.ReactNode][] = [
    ['inv.reference', inv.reference || inv.id.slice(0, 8).toUpperCase()],
    ['inv.statusLabel', <StatusBadge key="s" status={inv.status} />],
    ['inv.f.submitted', dt(inv.created_at)],
    ['inv.start', date(inv.start_date)],
    ['inv.maturity', date(inv.maturity_date)],
    ['inv.duration', v ? durationText(v, t) : t('inv.notSet')],
    ['inv.f.kFee', money(Number(inv.fee_amount))],
  ]
  if (inv.completed_at) rows.push(['inv.f.ended', date(inv.completed_at)])

  // One timeline: status changes and profit / return updates, oldest first.
  type Item = { at: string; title: string; note?: string }
  const timeline: Item[] = [
    ...events.filter(e => e.from_status !== e.to_status).map(e => ({
      at: e.created_at,
      title: e.to_status === 'active' ? t('inv.f.approvedEv') : e.to_status === 'pending_activation' ? t('inv.f.submitted') : t(`inv.status.${e.to_status}` as TKey),
      note: e.reason && e.to_status === 'rejected' ? e.reason : undefined,
    })),
    ...adjustments.map(a => ({ at: a.created_at, title: t('inv.f.profitSet', { from: signed(Number(a.previous_profit)), to: signed(Number(a.new_profit)) }), note: a.reason })),
  ].sort((x, y) => x.at.localeCompare(y.at))

  const cancel = async () => {
    if (busy || !confirm(t('inv.f.cancelConfirm'))) return
    setBusy(true); setErr('')
    try {
      await readJson(await authFetch('/api/client/investments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', investment_id: inv.id }) }))
      onChanged()
    } catch (e) { setErr(errorText(e)); setBusy(false) }
  }
  const tile = (label: TKey, value: string, cls = 'text-fg') => (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-fg-faint truncate">{t(label)}</p>
      <p className={`mt-0.5 text-base sm:text-lg font-semibold tabular-nums truncate ${cls}`}>{value}</p>
    </div>
  )

  return (
    <Sheet title={v?.name || t('inv.product')} onClose={onClose}>
      {inv.status === 'rejected' && inv.rejection_reason && (
        <div role="note" className="mb-4 rounded-xl border border-danger-400/40 bg-danger-400/[0.07] p-3 text-sm text-danger-300">{t('inv.f.rejectionReason')}: {inv.rejection_reason}</div>
      )}
      <section aria-label={t('inv.f.overview')}>
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-faint mb-2">{t('inv.f.overview')}</h3>
        {/* Principal, profit / return and value are kept apart and never blended */}
        <div className="grid grid-cols-2 gap-2">
          {tile('inv.f.kPrincipal', money(principal))}
          {tile('inv.f.currentValue', money(principal + profit))}
          {tile('inv.f.credited', signed(profit), tone)}
          {tile('inv.f.returnPct', running ? pctOf(profit, principal) : '—', tone)}
        </div>
        {hasProjection && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tile('inv.f.returnTerms', returnTermsText(inv, t))}
            {tile('inv.f.expectedReturn', money(expRet))}
            {tile('inv.f.expectedTotal', money(expTotal))}
          </div>
        )}
        {hasProjection && <p className="mt-2 text-xs text-fg-faint">{t('inv.f.projectedNote')}</p>}
        {running && profit === 0 && adjustments.length === 0 && <p className="mt-2 text-xs text-fg-faint">{t('inv.f.noPerformance')}</p>}
      </section>
      <dl className="mt-4 divide-y divide-ink-700 text-sm">
        {rows.map(([k, val]) => <div key={k} className="flex justify-between items-center gap-4 py-2.5"><dt className="text-fg-faint">{t(k)}</dt><dd className="text-fg text-right tabular-nums">{val}</dd></div>)}
      </dl>
      {timeline.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-fg-faint">{t('inv.f.timeline')}</h3>
          <ol className="mt-3 space-y-3 border-l border-ink-700 pl-4">
            {timeline.map((e, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent/80 ring-4 ring-ink-900" aria-hidden="true" />
                <p className="text-fg">{e.title}</p>
                <p className="text-xs text-fg-faint">{dt(e.at)}{e.note ? ` · ${e.note}` : ''}</p>
              </li>
            ))}
          </ol>
        </>
      )}
      {v && (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-fg-faint">{t('inv.f.productDetails')}</h3>
          <p className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-line">{v.description}</p>
          <dl className="mt-3 divide-y divide-ink-700 text-sm">
            {([
              ['inv.minimum', money(Number(v.min_amount))],
              ['inv.f.maximum', v.max_amount ? money(Number(v.max_amount)) : t('inv.f.noMaximum')],
              ['inv.duration', durationText(v, t)],
              ['inv.fee', feeText(v, t)],
              ['inv.termsVersion', t('inv.versionN', { n: v.version })],
              ['inv.f.riskVersion', t('inv.versionN', { n: v.version })],
            ] as [TKey, string][]).map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-fg-faint">{t(k)}</dt><dd className="text-fg text-right">{val}</dd></div>)}
          </dl>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-fg-muted py-2">{t('inv.riskDisclosure')} · {t('inv.terms')}</summary>
            <p className="mt-1 text-fg-muted leading-relaxed whitespace-pre-line">{v.risk_disclosure}</p>
            <p className="mt-3 text-fg-muted leading-relaxed whitespace-pre-line">{v.terms_text}</p>
          </details>
        </>
      )}
      {txs.some(x => x.tx) && (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-fg-faint">{t('inv.f.activity')}</h3>
          <ul className="mt-2 divide-y divide-ink-700 text-sm">
            {txs.filter(x => x.tx).map(x => (
              <li key={x.tx!.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0"><span className="text-fg">{KIND_KEY[x.kind] ? t(KIND_KEY[x.kind]) : x.kind}</span><span className="block text-xs text-fg-faint truncate">{x.tx!.reference || ''} · {dt(x.tx!.created_at)}</span></span>
                <span className="text-fg tabular-nums shrink-0">{money(Number(x.tx!.amount))}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p role="alert" className="mt-4 text-sm text-danger-300">{err}</p>}
      {inv.status === 'pending_activation' && <button onClick={cancel} disabled={busy} className="btn btn-outline w-full mt-6">{t('inv.f.cancelRequest')}</button>}
    </Sheet>
  )
}

// Home dashboard: the client's actual active investments, read from the same
// endpoint as the Investment Center. Nothing is shown that is not recorded.
export function ActiveInvestmentsCard({ go }: { go: (id: string) => void }) {
  const { t, intl } = useI18n()
  const [state, setState] = useState<{ invs: Investment[]; versions: Map<string, Version> } | 'error' | null>(null)
  useEffect(() => {
    let alive = true
    authFetch('/api/client/investments').then(r => readJson<Partial<Data>>(r)).then(raw => {
      if (!alive) return
      if (!Array.isArray(raw.investments) || !Array.isArray(raw.versions)) { setState('error'); return }
      setState({ invs: raw.investments.filter(i => i.status === 'active'), versions: new Map(raw.versions.map(v => [v.id, v])) })
    }).catch(() => alive && setState('error'))
    return () => { alive = false }
  }, [])
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  if (state === 'error') return null // the Portfolio tab shows the full error state
  return (
    <section className="panel overflow-hidden" aria-labelledby="ov-inv">
      <div className="flex items-center justify-between px-5 h-14 border-b border-ink-700">
        <h3 id="ov-inv" className="text-[15px] font-semibold text-fg">{t('inv.f.activeTitle')}</h3>
        <button onClick={() => go('portfolio')} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1">{t('common.viewAll')}</button>
      </div>
      {state === null ? (
        <div className="p-5 space-y-2" role="status" aria-label={t('common.loading')}><div className="skeleton h-4 w-40" /><div className="skeleton h-16" /></div>
      ) : state.invs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <span className="mx-auto mb-3 w-10 h-10 rounded-xl border border-ink-700 flex items-center justify-center text-fg-faint"><IconPie width={18} height={18} /></span>
          <p className="text-sm text-fg-muted">{t('inv.f.noActiveHome')}</p>
          <button onClick={() => go('portfolio')} className="btn btn-outline btn-sm mt-3">{t('inv.f.browsePlans')}</button>
        </div>
      ) : (
        <ul className="divide-y divide-ink-700">
          {state.invs.slice(0, 3).map(i => {
            const v = state.versions.get(i.product_version_id)
            const p = profitOf(i), principal = Number(i.principal)
            const tone = p > 0 ? 'price-up' : p < 0 ? 'price-down' : 'text-fg'
            return (
              <li key={i.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">{v?.name || t('inv.product')}</p>
                    <p className="text-xs text-fg-faint">{v ? durationText(v, t) : ''} · {date(i.start_date)} → {date(i.maturity_date)}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  {([['inv.f.invested', money(principal), 'text-fg'], ['inv.f.returnTerms', returnTermsText(i, t), 'text-fg'], ['inv.f.expectedReturn', Number(i.expected_return || 0) > 0 ? money(Number(i.expected_return)) : '—', 'text-fg'], ['inv.f.expectedTotal', Number(i.expected_return || 0) > 0 ? money(Number(i.expected_total || 0)) : '—', 'text-fg']] as [TKey, string, string][]).map(([k, val, cls]) => (
                    <div key={k} className="rounded-lg bg-ink-950/40 border border-ink-700/70 px-2.5 py-2 min-w-0">
                      <dt className="text-[11px] text-fg-faint truncate">{t(k)}</dt>
                      <dd className={`font-semibold tabular-nums truncate ${cls}`}>{val}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-fg-faint tabular-nums">{t('inv.f.credited')}: <span className={tone}>{signed(p)}</span>{Number(i.expected_return || 0) > 0 ? ` · ${t('inv.f.projectedNote')}` : ''}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

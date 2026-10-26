'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { IconChart, IconCheck, IconClose, IconPie, IconShield, IconTrend } from '@/components/Icons'
import { fmt } from '@/components/dashboard/shared'
import { projection } from '@/lib/returns'
import { EnginePanel } from '@/components/automation/EnginePanel'
import { parseInvestmentSummary, type InvestmentSummary } from '@/lib/investmentSummary'
import { AppScreen } from '@/components/AppScreen'

// The client's Investment Center. Everything shown is read from real records
// through /api/client/investments, which runs under row level security.
//
// Each figure has one defined source and nothing is estimated:
//   total invested      client_investment_summary().total_invested (shared
//                       with Overview: active + historical principal)
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
  // Documented by an admin after the fact: a past investment, never a new one.
  is_historical?: boolean
}
type Ev = { id: number; client_investment_id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }
type LinkedTx = { client_investment_id: string; kind: string; tx: { id: string; type: string; amount: number; direction: 'credit' | 'debit' | null; status: string; reference: string | null; notes: string | null; created_at: string } | null }
type Adj = { id: string; investment_id: string; transaction_id: string | null; previous_profit: number; new_profit: number; previous_value: number; new_value: number; reason: string; created_at: string }
type Balance = { available: number; pending: number; invested: number }
type Data = {
  products: Product[]; versions: Version[]; investments: Investment[]; returns: { client_investment_id: string; amount: number }[]
  events: Ev[]; transactions: LinkedTx[]; adjustments: Adj[]; balance: Balance | null; summary: InvestmentSummary | null; kyc_verified: boolean; investing_enabled: boolean
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
// Singular forms, so a 1-week plan reads "1 week" (not "1 weeks").
const UNIT_ONE = { days: 'inv.f.dDay', weeks: 'inv.f.dWeek', months: 'inv.f.dMonth', years: 'inv.f.dYear' } as const
type T = ReturnType<typeof useI18n>['t']
const durationText = (v: Version, t: T) =>
  v.duration_value && v.duration_unit ? t((Number(v.duration_value) === 1 ? UNIT_ONE : UNIT_KEY)[v.duration_unit], { n: v.duration_value })
  : v.term_days ? t(Number(v.term_days) === 1 ? 'inv.day' : 'inv.days', { n: v.term_days }) : t('inv.openEnded')
const feeText = (v: Version, t: T) => Number(v.entry_fee_pct) ? `${(Number(v.entry_fee_pct) * 100).toFixed(2)}%` : t('inv.noFee')

// Return terms of one investment, from the snapshot taken when it was made.
const returnTermsText = (i: { return_type?: string; return_rate_pct?: number | null; return_amount?: number | null }, v: Version | undefined, t: T) =>
  (i.return_type ?? v?.return_type) === 'fixed_rate' && (i.return_rate_pct ?? v?.return_rate_pct) != null ? `${Number(i.return_rate_pct ?? v?.return_rate_pct)}%`
  : (i.return_type ?? v?.return_type) === 'fixed_amount' && (i.return_amount ?? v?.return_amount) != null ? t('inv.f.fixedAmount', { amount: money(Number(i.return_amount ?? v?.return_amount)) })
  : '—'

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_TONE[status] || 'text-fg-muted border-ink-600'}`}>{t(`inv.status.${status}` as TKey)}</span>
}

// Performance card. States: A active + recorded history, B active only,
// C history only, D nothing yet. "History" is the running total of completed
// return ledger entries (credits minus debits), dated as recorded.
function PerformancePanel({ activeCount, activeAmount, recorded, txs, intl, basis, stage }: { activeCount: number; activeAmount: number; recorded: number; txs: LinkedTx[]; intl: string; basis: number; stage: 0 | 1 | 2 | 3 | null }) {
  const { t } = useI18n()
  const pts = useMemo(() => {
    const rows = txs.filter(x => x.kind === 'return' && x.tx?.status === 'completed' && x.tx.created_at)
      .map(x => ({ at: Date.parse(x.tx!.created_at), v: (x.tx!.direction === 'debit' ? -1 : 1) * Number(x.tx!.amount) }))
      .filter(r => Number.isFinite(r.at) && Number.isFinite(r.v)).sort((a, b) => a.at - b.at)
    let run = 0
    return rows.map(r => ({ at: r.at, total: (run += r.v) }))
  }, [txs])
  const last = pts.length ? pts[pts.length - 1].at : null
  const d = (ms: number) => new Date(ms).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' })
  const isActive = activeCount > 0
  const chart = pts.length > 0 ? (() => {
    const w = 600, h = 140, lead = Math.max(86_400_000, (pts[pts.length - 1].at - pts[0].at) * 0.15)
    const series = [{ at: pts[0].at - lead, total: 0 }, ...pts]
    const min = Math.min(0, ...series.map(p => p.total)), max = Math.max(...series.map(p => p.total), 1), span = max - min || 1
    const t0 = series[0].at, t1 = Math.max(series[series.length - 1].at, t0 + 1)
    const x = (at: number) => ((at - t0) / (t1 - t0)) * w, y = (v: number) => h - 8 - ((v - min) / span) * (h - 16)
    // Step line: the total changes only when a return is recorded.
    let dPath = `M0,${y(0)}`; series.slice(1).forEach(p => { dPath += ` H${x(p.at).toFixed(1)} V${y(p.total).toFixed(1)}` }); dPath += ` H${w}`
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-36" role="img" aria-label={t('inv.f.perfChart')}>
        <path d={`${dPath} V${h} H0 Z`} style={{ fill: 'rgb(var(--accent))', fillOpacity: 0.08 }} />
        <path d={dPath} fill="none" style={{ stroke: 'rgb(var(--accent))' }} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {pts.map(p => <circle key={p.at} cx={x(p.at)} cy={y(p.total)} r="3" style={{ fill: 'rgb(var(--accent))' }} />)}
      </svg>
    )
  })() : null
  return (
    <section className="panel p-5 perf-panel" data-perf-state={isActive ? (chart ? 'A' : 'B') : chart ? 'C' : 'D'} aria-labelledby="inv-perf">
      <div className="flex items-start justify-between gap-3">
        <h3 id="inv-perf" className="text-[15px] font-semibold text-fg">{t('inv.performance')}</h3>
        {isActive && (
          <span className="perf-active inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1 text-[12px] text-emerald-300">
            <span className="perf-ring" aria-hidden="true"><span /></span>{t('inv.f.perfActive')}
          </span>
        )}
      </div>
      {/* Lifecycle of the most relevant investment (active, else pending, else latest completed). */}
      {stage != null && (
        <ol className="inv-life mt-4 grid grid-cols-4 gap-1 text-[10.5px] text-center" aria-label="Investment lifecycle">
          {['Requested', 'Active', 'Profit recorded', 'Completed'].map((x, i) => (
            <li key={x} className={`inv-life-step ${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}`} aria-current={i === stage ? 'step' : undefined}><span aria-hidden="true" />{x}</li>
          ))}
        </ol>
      )}
      {(isActive || chart) && (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {isActive && <div className="min-w-0"><dt className="text-[11px] text-fg-faint">{t('inv.f.perfActiveAmount')}</dt><dd className="text-base font-semibold text-fg tabular-nums truncate">{money(activeAmount)}</dd><dd className="text-[11px] text-fg-faint">{t('dash.countActive', { n: activeCount })}</dd></div>}
          <div className="min-w-0"><dt className="text-[11px] text-fg-faint">{t('inv.f.perfRecorded')}</dt><dd className={`text-base font-semibold tabular-nums truncate ${recorded > 0 ? 'price-up' : recorded < 0 ? 'price-down' : 'text-fg'}`}>{signed(recorded)}</dd>
            {basis > 0 && <dd className="text-[11px] text-fg-faint tabular-nums" title="Recorded return ÷ total invested principal">{pctOf(recorded, basis)}</dd>}</div>
          {last && <div className="min-w-0 col-span-2 sm:col-span-1"><dt className="text-[11px] text-fg-faint">{t('inv.f.perfLast')}</dt><dd className="text-sm text-fg">{d(last)}</dd></div>}
        </dl>
      )}
      {chart ? (
        <div className="mt-4">
          <p className="text-[11px] text-fg-faint mb-1">{t('inv.f.perfChart')}</p>
          {chart}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-3" data-perf-empty>
          <span className="w-9 h-9 shrink-0 rounded-lg border border-ink-700 flex items-center justify-center text-fg-faint"><IconTrend width={17} height={17} aria-hidden="true" /></span>
          <div className="min-w-0 pt-1.5">
            <p className="text-[14px] text-fg-muted">{isActive ? t('inv.f.perfNoHistory') : t('inv.performanceEmpty')}</p>
            {isActive && <p className="text-[12px] text-fg-faint mt-0.5">{t('inv.f.perfNoHistoryBody')}</p>}
          </div>
        </div>
      )}
    </section>
  )
}

type Filter = 'all' | 'active' | 'pending' | 'completed'
const FILTERS: [Filter, TKey][] = [['all', 'inv.f.filterAll'], ['active', 'inv.status.active'], ['pending', 'inv.f.filterPending'], ['completed', 'inv.f.filterClosed']]
const matches = (f: Filter, status: string) =>
  f === 'all' ? true : f === 'active' ? status === 'active'
  : f === 'pending' ? status === 'pending_activation' || status === 'approved'
  : !['active', 'pending_activation', 'approved'].includes(status)

export function InvestmentCenter({ go, focusId, onFocusDone, onAccountChanged }: { go: (id: string) => void; focusId?: string | null; onFocusDone?: () => void; onAccountChanged?: () => void }) {
  const { t, intl } = useI18n()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Version | null>(null)
  const [startAt, setStartAt] = useState<'details' | 'amount'>('details')
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
        summary: parseInvestmentSummary(raw.summary),
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
  // Totals come from the shared server summary (all records, same rules as
  // Overview); the local sums over the listed records are only a fallback.
  const sum = data?.summary ?? null
  const principal = sum ? sum.active_principal : active.reduce((s, i) => s + Number(i.principal), 0)
  const held = sum ? sum.pending_principal : pending.reduce((s, i) => s + Number(i.principal), 0)
  const pendingN = sum ? sum.pending_count : pending.length
  const realised = sum ? sum.investment_profit : invs.reduce((s, i) => s + profitOf(i), 0)
  const totalInvested = sum ? sum.total_invested : null
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
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="panel p-4 space-y-2"><div className="skeleton h-3 w-20" /><div className="skeleton h-6 w-24" /></div>)}</div>
        <div className="panel p-5 space-y-3"><div className="skeleton h-4 w-40" /><div className="skeleton h-24" /></div>
      </div>
    )
  }

  const stats: { label: TKey; value: string; hint: TKey; muted?: boolean; note?: string }[] = [
    { label: 'dash.totalInvested', value: totalInvested != null ? money(totalInvested) : t('dash.unavailable'), hint: 'dash.totalInvestedHint', muted: totalInvested == null },
    // $0 active while requests await activation is said in words, not left as a bare $0.00.
    { label: 'inv.principal', value: money(principal), hint: 'inv.principalHint', note: principal === 0 && held > 0 ? t('dash.pendingOnly', { amount: money(held) }) : undefined },
    { label: 'inv.activeCount', value: String(active.length), hint: 'inv.activeCountHint' },
    { label: 'inv.f.pendingCount', value: pendingN ? `${pendingN} · ${money(held)}` : '0', hint: 'inv.f.pendingHint', muted: !pendingN },
    { label: 'inv.f.currentValue', value: money(activeValue), hint: 'inv.f.currentValueHint', muted: !active.length },
    { label: 'inv.f.profit', value: signed(realised), hint: 'inv.f.profitHint', muted: realised === 0 },
  ]

  return (
    <div className="space-y-7 inv2">
      {/* The Invest tab opens straight on the plans: a plain heading, the
          available balance, and the products configured by the team. */}
      <section aria-labelledby="inv-title" data-inv-plans>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-4">
          <h2 id="inv-title" className="text-[22px] sm:text-[26px] leading-tight font-semibold tracking-[-0.02em] text-fg">{t('inv.n.plansTitle')}</h2>
          {data.balance && (
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-3.5 py-1.5 text-[13.5px] text-fg-muted" data-inv-available>
              {t('inv.n.available')} <span className="text-fg font-semibold tabular-nums">{money(data.balance.available)}</span>
            </p>
          )}
        </div>
        {offers.length === 0 ? (
          <div className="panel px-4 py-4 flex items-center gap-3">
            <span className="shrink-0 w-9 h-9 rounded-lg border border-ink-700 flex items-center justify-center text-fg-faint"><IconChart width={17} height={17} /></span>
            <p className="text-[15px] text-fg-muted">{t('inv.f.noPlans')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4" id="inv-products">
            {offers.map(v => <PlanCard key={v.id} v={v} onDetails={() => { setStartAt('details'); setOpen(v) }} onInvest={() => { setStartAt('amount'); setOpen(v) }} />)}
          </div>
        )}
      </section>

      {/* My investments: every status, nothing hidden or deleted */}
      <section className="scroll-mt-20" id="inv-mine-section" aria-labelledby="inv-mine">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 id="inv-mine" className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-fg">{t('inv.f.myInvestments')}</h2>
          {hasInvestments && (
            <div className="flex gap-1.5 overflow-x-auto max-w-full" role="tablist" aria-label={t('inv.f.myInvestments')}>
              {FILTERS.map(([id, label]) => {
                const n = invs.filter(x => matches(id, x.status)).length
                return (
                  <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                    className={`shrink-0 min-h-10 px-3.5 rounded-full border text-[13.5px] transition-colors ${filter === id ? 'border-accent/60 bg-accent/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg'}`}>
                    {t(label)} <span className="tabular-nums text-fg-faint">{n}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {hasInvestments && shown.length === 0 && <p className="panel px-5 py-8 text-center text-[15px] text-fg-muted">{t('inv.f.noneInFilter')}</p>}
        {hasInvestments ? (
          <ul className="grid md:grid-cols-2 gap-4">
            {shown.map(i => <li key={i.id} className="min-w-0"><TrackCard inv={i} v={versionById.get(i.product_version_id)} onOpen={() => setOpenInv(i)} /></li>)}
          </ul>
        ) : (
          <div className="panel px-4 py-4 flex flex-wrap items-center gap-3">
            <span className="shrink-0 w-9 h-9 rounded-lg border border-ink-700 flex items-center justify-center text-fg-faint"><IconPie width={17} height={17} /></span>
            <p className="text-[15px] text-fg-muted flex-1 min-w-0">{t('inv.f.noInvestments')}</p>
          </div>
        )}
      </section>

      {/* Summary figures, from the shared server summary. */}
      <section aria-labelledby="inv-summary">
        <h2 id="inv-summary" className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-fg mb-3">{t('inv.n.summary')}</h2>
        <dl className="panel px-4 py-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-4" data-inv-stats>
          {stats.map(s => (
            <div key={s.label} className="min-w-0" title={t(s.hint)}>
              <dt className="text-[12.5px] leading-tight text-fg-faint">{t(s.label)}</dt>
              <dd className={`mt-1 font-semibold tabular-nums break-words ${s.value.length > 14 ? 'text-[14px] leading-snug' : 'text-[17px]'} ${s.muted ? 'text-fg-muted' : 'text-fg'}`}>{s.value}</dd>
              {s.note && <p className="mt-0.5 text-[12px] leading-snug text-amber-300" data-note="">{s.note}</p>}
            </div>
          ))}
        </dl>
      </section>

      {/* Performance: active state from the investment records; history only
          from recorded return ledger entries (no valuation feed exists, so
          nothing is estimated or animated as if it were). */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] items-start">
        <PerformancePanel activeCount={sum ? sum.active_count : active.length} activeAmount={principal} recorded={realised}
          txs={data.transactions} intl={intl} basis={sum ? sum.total_invested : 0}
          stage={active.length ? (active.some(i => profitOf(i) !== 0) ? 2 : 1) : pending.length ? 0 : invs.some(i => ['completed', 'matured', 'closed'].includes(i.status)) ? 3 : null} />
        {/* Related, not causal: the automation layer monitors; performance is
            what is recorded in the account. */}
        <EnginePanel variant="client" />
      </div>

      {open && <ProductDetail v={open} start={startAt} kycVerified={data.kyc_verified} balance={data.balance} onClose={() => setOpen(null)} onSubmitted={() => { load(); onAccountChanged?.() }}
        onViewMine={() => { setOpen(null); setFilter('all'); requestAnimationFrame(() => document.getElementById('inv-mine-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} go={go} />}
      {openInv && (
        <InvestmentDetail inv={openInv} v={versionById.get(openInv.product_version_id)}
          adjustments={data.adjustments.filter(a => a.investment_id === openInv.id)}
          events={data.events.filter(e => e.client_investment_id === openInv.id)}
          txs={data.transactions.filter(x => x.client_investment_id === openInv.id)}
          onClose={() => setOpenInv(null)} onChanged={() => { setOpenInv(null); load(); onAccountChanged?.() }} />
      )}
    </div>
  )
}

// Plan details, the invest flow and an investment's details open as app
// screens: full screen on phones (Back closes them), a dialog on desktop.
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AppScreen title={title} onClose={onClose} attrs={{ 'data-inv-sheet': '' }}>
      <div className="p-5 sm:p-6">{children}</div>
    </AppScreen>
  )
}

// ---- Plan cards, details and the three-step investment flow ----

// Small line icons for the plan rows (gold, decorative only).
const I = {
  crown: <path d="M4 17h16M5 17 3.5 8l5 3.5L12 5l3.5 6.5 5-3.5L19 17" />,
  ret: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M14.6 9.6c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 1.9 0 2.7 5.3 1.4 5.3 4 0 1.1-1.2 2-2.7 2-1.2 0-2.2-.5-2.7-1.4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  min: <><path d="M4 7.5h16v9H4z" /><path d="M8 12h8" /></>,
  max: <><path d="M4 7.5h16v9H4z" /><path d="M8 12h8M12 8v8" /></>,
  fee: <><path d="M7 17 17 7" /><circle cx="8" cy="8" r="2" /><circle cx="16" cy="16" r="2" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
}
function RowIcon({ d }: { d: React.ReactNode }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent" aria-hidden="true">{d}</svg>
}
function PlanBadge({ size = 44 }: { size?: number }) {
  return (
    <span className="inv2-badge shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{I.crown}</svg>
    </span>
  )
}
// The product's stated return, exactly as configured (never a multiple or a promise).
const statedReturn = (v: Version, t: T) =>
  v.return_type === 'fixed_rate' && v.return_rate_pct != null ? { big: `${Number(v.return_rate_pct).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`, sub: t('inv.n.forTerm') }
  : v.return_type === 'fixed_amount' && v.return_amount != null ? { big: money(Number(v.return_amount)), sub: t('inv.n.forTerm') }
  : { big: t('inv.noStatedReturn'), sub: '' }
const riskText = (v: Version, t: T) => t(`inv.risk.${v.risk_level}` as TKey)

function PlanCard({ v, onDetails, onInvest }: { v: Version; onDetails: () => void; onInvest: () => void }) {
  const { t } = useI18n()
  const ret = statedReturn(v, t)
  const rows: [React.ReactNode, string, string][] = [
    [I.clock, t('inv.duration'), durationText(v, t)],
    [I.min, t('inv.minimum'), money(Number(v.min_amount))],
    [I.max, t('inv.f.maximum'), v.max_amount ? money(Number(v.max_amount)) : t('inv.f.noMaximum')],
    [I.fee, t('inv.fee'), feeText(v, t)],
  ]
  return (
    <article className="inv2-card panel flex flex-col min-w-0" aria-labelledby={`plan-${v.id}`} data-plan={v.id}>
      <div className="flex items-start gap-3.5">
        <PlanBadge />
        <div className="min-w-0 flex-1">
          <h3 id={`plan-${v.id}`} className="text-[18px] leading-snug font-semibold text-fg">{v.name}</h3>
          {v.description && <p className="mt-0.5 text-[14px] leading-snug text-fg-muted line-clamp-2">{v.description}</p>}
          <span className={`mt-2 inline-flex text-[12.5px] font-medium px-2.5 py-0.5 rounded-full border ${RISK_TONE[v.risk_level]}`} data-plan-risk>{riskText(v, t)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3" data-plan-return>
        <span className="flex items-center gap-2.5 text-[14px] text-fg-muted"><RowIcon d={I.ret} />{t('inv.statedReturn')}</span>
        <span className="text-right"><span className="block text-[22px] leading-none font-semibold text-accent tabular-nums">{ret.big}</span>{ret.sub && <span className="block text-[12px] text-fg-faint mt-1">{ret.sub}</span>}</span>
      </div>
      <dl className="mt-2 divide-y divide-ink-700">
        {rows.map(([icon, k, val]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-3">
            <dt className="flex items-center gap-2.5 text-[14px] text-fg-muted"><RowIcon d={icon} />{k}</dt>
            <dd className="text-[15px] text-fg text-right tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-4 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onDetails} className="btn btn-outline min-h-12" data-plan-details>{t('inv.viewDetails')}</button>
        <button type="button" onClick={onInvest} className="btn btn-solid min-h-12" data-plan-invest>{t('inv.n.investNow')}</button>
      </div>
    </article>
  )
}

function Stepper({ step }: { step: 0 | 1 | 2 | 3 }) {
  const { t } = useI18n()
  const labels: TKey[] = ['inv.n.stepAmount', 'inv.n.stepReview', 'inv.n.stepConfirm']
  return (
    <ol className="inv2-steps" aria-label={t('inv.n.steps')}>
      {labels.map((l, i) => (
        <li key={l} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}>
          <span className="inv2-step-dot" aria-hidden="true">{i < step ? <IconCheck width={15} height={15} /> : i + 1}</span>
          <span className="inv2-step-label">{t(l)}{i < step ? <span className="sr-only"> ({t('inv.n.stepDone')})</span> : null}</span>
        </li>
      ))}
    </ol>
  )
}

function ProductSummary({ v }: { v: Version }) {
  const { t } = useI18n()
  const ret = statedReturn(v, t)
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
      <div className="flex items-center gap-3">
        <PlanBadge size={40} />
        <div className="min-w-0"><p className="text-[16px] font-semibold text-fg truncate">{v.name}</p><p className="text-[13px] text-fg-faint">{riskText(v, t)}</p></div>
      </div>
      <dl className="mt-3 divide-y divide-ink-700 text-[14px]">
        <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('inv.statedReturn')}</dt><dd className="text-accent font-semibold text-right tabular-nums">{ret.big}{ret.sub ? ` ${ret.sub}` : ''}</dd></div>
        <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('inv.duration')}</dt><dd className="text-fg text-right">{durationText(v, t)}</dd></div>
      </dl>
    </div>
  )
}

function ProductDetail({ v, start, kycVerified, balance, onClose, onSubmitted, onViewMine, go }: { v: Version; start: 'details' | 'amount'; kycVerified: boolean; balance: Balance | null; onClose: () => void; onSubmitted: () => void; onViewMine: () => void; go: (id: string) => void }) {
  const { t } = useI18n()
  const kycRequired = v.eligibility?.kyc_required !== false
  const eligible = !kycRequired || kycVerified
  // Without eligibility the flow cannot start: the details explain why.
  const [step, setStep] = useState<'details' | 'invest'>(start === 'amount' && eligible ? 'invest' : 'details')
  const ret = statedReturn(v, t)
  const rows: [React.ReactNode, TKey, string][] = [
    [I.min, 'inv.range', v.max_amount ? `${money(Number(v.min_amount))} – ${money(Number(v.max_amount))}` : t('inv.fromAmount', { amount: money(Number(v.min_amount)) })],
    [I.clock, 'inv.duration', durationText(v, t)],
    [I.cal, 'inv.n.maturity', t('inv.n.maturityAfter', { duration: durationText(v, t) })],
    [I.ret, 'inv.statedReturn', `${ret.big}${ret.sub ? ` ${ret.sub}` : ''}`],
    [I.fee, 'inv.fee', feeText(v, t)],
    [I.max, 'inv.currency', v.currency],
  ]
  if (step === 'invest') return <Sheet title={t('inv.f.investIn', { name: v.name })} onClose={onClose}><InvestFlow v={v} balance={balance} onBack={() => setStep('details')} onSubmitted={onSubmitted} onClose={onClose} onViewMine={onViewMine} /></Sheet>
  return (
    <Sheet title={t('inv.n.planDetails')} onClose={onClose}>
      <div className="flex items-start gap-3.5">
        <PlanBadge size={52} />
        <div className="min-w-0">
          <p className="text-[20px] leading-snug font-semibold text-fg">{v.name}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-500/[0.07] px-2.5 py-0.5 text-success-300">{t('inv.n.available2')}</span>
            <span className={`rounded-full border px-2.5 py-0.5 ${RISK_TONE[v.risk_level]}`}>{riskText(v, t)}</span>
          </p>
        </div>
      </div>
      {v.description && <p className="mt-4 text-[15px] text-fg-muted leading-relaxed whitespace-pre-line">{v.description}</p>}
      <dl className="mt-4 rounded-2xl border border-ink-700 divide-y divide-ink-700 px-4" data-plan-terms>
        {rows.map(([icon, k, val]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-3">
            <dt className="flex items-center gap-2.5 text-[14px] text-fg-muted"><RowIcon d={icon} />{t(k)}</dt>
            <dd className={`text-[15px] text-right ${k === 'inv.statedReturn' ? 'text-accent font-semibold' : 'text-fg'}`}>{val}</dd>
          </div>
        ))}
      </dl>
      {v.return_type !== 'none' && <p className="mt-2 text-[13px] text-fg-faint">{t('inv.f.projectedOnProduct')}</p>}

      <h3 className="mt-6 text-[15px] font-semibold text-fg">{t('inv.n.howTitle')}</h3>
      <ol className="mt-2 space-y-2 text-[14px] text-fg-muted">
        {(['inv.n.how1', 'inv.n.how2', 'inv.n.how3'] as TKey[]).map((k, i) => (
          <li key={k} className="flex gap-3"><span className="inv2-how-n" aria-hidden="true">{i + 1}</span><span className="pt-0.5">{t(k)}</span></li>
        ))}
      </ol>

      <div className="mt-5 rounded-xl border border-ink-700 p-4">
        <p className="flex items-start gap-2 text-[14px]">
          <IconShield width={16} height={16} className={`shrink-0 mt-0.5 ${eligible ? 'text-success-400' : 'text-warning-400'}`} aria-hidden="true" />
          <span className="text-fg-muted">{!kycRequired ? t('inv.eligibleNoKyc') : kycVerified ? t('inv.eligibleKyc') : t('inv.needsKyc')}</span>
        </p>
        {!eligible && <button onClick={() => { onClose(); go('verification') }} className="btn btn-outline btn-sm mt-3">{t('overview.kycStart')}</button>}
      </div>

      <details className="mt-4 text-[14px] rounded-xl border border-ink-700 px-4">
        <summary className="cursor-pointer text-fg py-3 font-medium">{t('inv.riskDisclosure')} · {t('inv.terms')} · {t('inv.f.cancellation')}</summary>
        <p className="text-fg-muted leading-relaxed whitespace-pre-line">{v.risk_disclosure}</p>
        <p className="mt-3 text-fg-muted leading-relaxed whitespace-pre-line">{v.terms_text}</p>
        <p className="mt-3 mb-3 text-fg-muted leading-relaxed whitespace-pre-line">{v.cancellation_allowed && v.cancellation_terms ? v.cancellation_terms : t('inv.f.cancellationNotAllowed')}</p>
      </details>

      <div className="sticky bottom-0 -mx-5 sm:-mx-6 mt-6 px-5 sm:px-6 py-3 glass-bar border-t border-ink-700">
        <button disabled={!eligible} onClick={() => setStep('invest')} className="btn btn-solid w-full min-h-12 text-[16px]" data-plan-start>{eligible ? t('inv.n.investNow') : t('inv.f.kycFirst')}</button>
      </div>
    </Sheet>
  )
}

type Submitted = { id?: string; reference?: string | null; status?: string; principal?: number | string; amount?: number | string }

// Amount → Review → Confirm. The checks here only help the client; the
// database function repeats every one of them against the real balance. The
// result screen shows what the server actually recorded.
function InvestFlow({ v, balance, onBack, onSubmitted, onClose, onViewMine }: { v: Version; balance: Balance | null; onBack: () => void; onSubmitted: () => void; onClose: () => void; onViewMine: () => void }) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'amount' | 'review' | 'done'>('amount')
  const [amount, setAmount] = useState('')
  const [accept, setAccept] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Submitted | null>(null)
  // One key per attempt: a double tap or network retry reuses it, so the
  // server returns the same request instead of creating a second one.
  const key = useRef(newRequestKey())
  const n = Number(amount)
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && n > 0
  const fee = valid ? Math.round(n * Number(v.entry_fee_pct) * 100) / 100 : 0
  // Same formula the database uses; the stored figure always comes from the server.
  const proj = valid ? projection(amount.trim(), v.entry_fee_pct, { type: v.return_type, ratePct: v.return_rate_pct, amount: v.return_amount }) : null
  const available = balance?.available ?? null
  const min = Number(v.min_amount), max = v.max_amount !== null ? Number(v.max_amount) : null
  const problem =
    !amount ? '' :
    !valid ? t('inv.f.errAmount') :
    n < min ? t('inv.f.errMin', { amount: money(min) }) :
    max !== null && n > max ? t('inv.f.errMax', { amount: money(max) }) :
    available !== null && n > available ? t('inv.f.errBalance') : ''
  // Quick amounts: only values the product and the balance allow.
  const quick = Array.from(new Set([min, 500, 1000, 5000, 10000, 25000].filter(x => x >= min && (max === null || x <= max) && (available === null || x <= available)))).slice(0, 4)

  const submit = async () => {
    if (busy) return
    if (!accept) { setErr(t('inv.f.errTerms')); return }
    if (!valid || problem) return
    setBusy(true); setErr('')
    try {
      const r = await readJson<{ investment?: Submitted }>(await authFetch('/api/client/investments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current },
        body: JSON.stringify({ action: 'submit', version_id: v.id, amount: amount.trim(), accept_terms: true, idempotency_key: key.current }),
      }))
      setResult(r.investment && typeof r.investment === 'object' ? r.investment : {})
      setPhase('done')
      onSubmitted()
    } catch (e) {
      setErr(errorText(e))
      key.current = newRequestKey()
    } finally { setBusy(false) }
  }
  const row = (k: TKey, val: string, strong = false, note?: string, accent = false) => (
    <div className="py-3">
      <div className="flex justify-between gap-4"><dt className="text-fg-muted">{t(k)}</dt><dd className={`text-right tabular-nums ${accent ? 'text-accent font-semibold' : strong ? 'text-fg font-semibold' : 'text-fg'}`}>{val}</dd></div>
      {note && <p className="mt-1 text-[12.5px] text-fg-faint">{note}</p>}
    </div>
  )
  if (phase === 'done') {
    const st = result?.status || 'pending_activation'
    const activeNow = st === 'active'
    return (
      <div className="text-center" role="status" data-invest-result={st}>
        <Stepper step={3} />
        <span className={`inv2-done-ring mx-auto mt-6 ${activeNow ? '' : 'is-pending'}`} aria-hidden="true"><IconCheck width={34} height={34} /></span>
        <p className="mt-4 text-[22px] leading-snug font-semibold text-fg">{activeNow ? t('inv.n.doneActive') : t('inv.f.submittedTitle')}</p>
        <p className="mt-2 text-[15px] text-fg-muted max-w-sm mx-auto">{activeNow ? t('inv.n.doneActiveBody') : t('inv.f.submittedBody')}</p>
        <dl className="mt-5 text-left rounded-2xl border border-ink-700 divide-y divide-ink-700 px-4 text-[14px]">
          {row('inv.product', v.name)}
          {row('inv.f.investmentAmount', money(n), true)}
          {row('inv.duration', durationText(v, t))}
          {row('inv.statusLabel', t(`inv.status.${st}` as TKey))}
          {result?.reference ? row('inv.reference', String(result.reference)) : null}
        </dl>
        <div className="mt-5 grid gap-2.5">
          <button onClick={onViewMine} className="btn btn-solid w-full min-h-12" data-invest-view-mine>{t('inv.n.viewMine')}</button>
          <button onClick={onClose} className="btn btn-outline w-full min-h-12">{t('inv.f.done')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'review') {
    return (
      <div className="space-y-5" data-invest-step="review">
        <Stepper step={1} />
        <h3 className="text-[19px] font-semibold text-fg">{t('inv.n.reviewTitle')}</h3>
        <ProductSummary v={v} />
        <dl className="divide-y divide-ink-700 text-[14px] rounded-2xl border border-ink-700 px-4" data-invest-review>
          {row('inv.f.available', available === null ? '—' : money(available))}
          {row('inv.f.investmentAmount', money(n), true)}
          {row('inv.f.kFee', `${Number(v.entry_fee_pct) ? '−' : ''}${money(fee)}`, false, Number(v.entry_fee_pct) ? `${feeText(v, t)} · ${t('inv.f.feeNote')}` : undefined)}
          {row('inv.f.principalAfter', money(Math.round((n - fee) * 100) / 100), true)}
          {v.return_type !== 'none' && proj ? row('inv.n.projected', `${money(proj.profit)} · ${t('inv.n.projectedTotal', { total: money(proj.total) })}`, false, t('inv.f.projectedOnProduct')) : null}
          {row('inv.duration', durationText(v, t))}
          {row('inv.n.starts', t('inv.n.startsWhen'))}
          {row('inv.n.maturity', t('inv.n.maturityAfter', { duration: durationText(v, t) }))}
          {row('inv.f.remainingAvailable', available === null ? '—' : money(Math.max(0, Math.round((available - n) * 100) / 100)), false, t('inv.f.remainingNote'))}
        </dl>
        <p className="flex items-start gap-2.5 rounded-xl border border-sky-400/30 bg-sky-400/[0.06] px-4 py-3 text-[14px] text-sky-100" role="note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 mt-px text-sky-300" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>
          {t('inv.n.reviewNote')}
        </p>
        <label className="flex items-start gap-3 text-[14.5px] text-fg-muted cursor-pointer min-h-11">
          <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-[rgb(var(--accent))]" checked={accept} onChange={e => { setAccept(e.target.checked); setErr('') }} data-invest-accept />
          <span>{t('inv.f.accept', { n: v.version })}</span>
        </label>
        {err && <p role="alert" className="text-[14px] text-danger-300">{err}</p>}
        <div className="grid gap-2.5">
          <button onClick={submit} disabled={busy || !accept} aria-busy={busy} className="btn btn-solid w-full min-h-12 text-[16px]" data-invest-confirm>{busy ? t('inv.f.submitting') : t('inv.f.confirm')}</button>
          <button onClick={() => { setPhase('amount'); setErr('') }} disabled={busy} className="btn btn-outline w-full min-h-12">{t('inv.f.back')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-invest-step="amount">
      <Stepper step={0} />
      <label className="block">
        <span className="block text-[19px] font-semibold text-fg mb-3">{t('inv.n.enterAmount')}</span>
        <span className={`inv2-amount ${problem ? 'is-invalid' : ''}`}>
          <span className="text-fg-faint text-[22px]" aria-hidden="true">$</span>
          <input className="min-w-0 flex-1 bg-transparent outline-none text-[26px] font-semibold tabular-nums text-fg" inputMode="decimal" autoFocus value={amount}
            onChange={e => { setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')); setErr('') }} placeholder={String(min)} aria-invalid={!!problem}
            aria-describedby="inv-amount-help" data-invest-amount />
          {amount && <button type="button" onClick={() => setAmount('')} className="shrink-0 w-9 h-9 rounded-full grid place-items-center text-fg-faint hover:text-fg" aria-label={t('inv.n.clear')}><IconClose width={16} height={16} /></button>}
        </span>
      </label>
      {quick.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }} role="group" aria-label={t('inv.n.quick')}>
          {quick.map(q => (
            <button key={q} type="button" onClick={() => { setAmount(String(q)); setErr('') }} aria-pressed={n === q}
              className={`min-h-11 rounded-xl border text-[14px] tabular-nums transition-colors ${n === q ? 'border-accent/70 bg-accent/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg'}`}>{money(q).replace('.00', '')}</button>
          ))}
        </div>
      )}
      <p id="inv-amount-help" className="text-[13px] text-fg-faint">
        {max !== null ? t('inv.f.limitsRange', { min: money(min), max: money(max) }) : t('inv.f.limitsMin', { min: money(min) })}
        {available !== null && <> · {t('inv.n.available')}: <span className="text-fg tabular-nums">{money(available)}</span></>}
      </p>
      {problem && <p role="alert" className="text-[14px] text-danger-300">{problem}</p>}
      <ProductSummary v={v} />
      <div className="grid gap-2.5">
        <button onClick={() => setPhase('review')} disabled={!valid || !!problem} className="btn btn-solid w-full min-h-12 text-[16px]" data-invest-continue>{t('inv.n.continue')}</button>
        <button onClick={onBack} className="btn btn-outline w-full min-h-12">{t('inv.n.backToPlan')}</button>
      </div>
    </div>
  )
}

// One investment in "My investments". Progress is shown only for an active
// investment with recorded start and maturity dates, and is computed from
// those dates (never from the record's entry time).
function TrackCard({ inv, v, onOpen }: { inv: Investment; v?: Version; onOpen: () => void }) {
  const { t, intl } = useI18n()
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  const running = ['active', 'completed', 'matured'].includes(inv.status)
  const profit = running ? profitOf(inv) : 0
  let progress: { pct: number; day: number; total: number; reached: boolean } | null = null
  if (inv.status === 'active' && inv.start_date && inv.maturity_date) {
    const s = Date.parse(inv.start_date), e = Date.parse(inv.maturity_date), now = Date.now()
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      const total = Math.max(1, Math.round((e - s) / 864e5))
      const day = Math.min(total, Math.max(0, Math.floor((now - s) / 864e5)))
      progress = { pct: Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100)), day, total, reached: now >= e }
    }
  }
  const when = inv.start_date && (running || inv.is_historical) ? t('inv.n.investedOn', { date: date(inv.start_date) }) : t('inv.n.requestedOn', { date: date(inv.created_at) })
  return (
    <article className="inv2-card panel min-w-0" data-inv-status={inv.status} aria-labelledby={`inv-${inv.id}`}>
      <div className="flex items-start gap-3.5">
        <PlanBadge size={42} />
        <div className="min-w-0 flex-1">
          <h3 id={`inv-${inv.id}`} className="text-[17px] leading-snug font-semibold text-fg truncate">{v?.name || t('inv.product')}</h3>
          <p className="text-[13px] text-fg-faint truncate">{when}</p>
        </div>
        <StatusBadge status={inv.status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0"><dt className="text-[12.5px] text-fg-faint">{t('inv.f.kPrincipal')}</dt><dd className="text-[19px] font-semibold text-fg tabular-nums truncate">{money(Number(inv.principal))}</dd></div>
        <div className="min-w-0 text-right"><dt className="text-[12.5px] text-fg-faint">{t('inv.f.credited')}</dt><dd className={`text-[19px] font-semibold tabular-nums truncate ${profit > 0 ? 'price-up' : profit < 0 ? 'price-down' : 'text-fg'}`}>{running ? signed(profit) : '—'}</dd></div>
      </dl>
      {progress && (
        <div className="mt-4" data-inv-progress>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="text-fg-muted">{progress.reached ? t('inv.n.maturityReached') : t('inv.n.dayOf', { n: progress.day, total: progress.total })}</span>
            <span className="text-fg tabular-nums">{Math.round(progress.pct)}%</span>
          </div>
          <div className="inv2-bar mt-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.pct)} aria-label={t('inv.n.termProgress')}><span style={{ width: `${progress.pct}%` }} /></div>
        </div>
      )}
      <dl className="mt-3 divide-y divide-ink-700 text-[14px]">
        {inv.maturity_date && <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('inv.maturity')}</dt><dd className="text-fg tabular-nums">{date(inv.maturity_date)}</dd></div>}
        {inv.completed_at && ['completed', 'matured', 'closed'].includes(inv.status) && <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('inv.f.ended')}</dt><dd className="text-fg tabular-nums">{date(inv.completed_at)}</dd></div>}
        {inv.reference && <div className="flex justify-between gap-4 py-2.5"><dt className="text-fg-muted">{t('inv.reference')}</dt><dd className="text-fg font-mono text-[13px] truncate">{inv.reference}</dd></div>}
      </dl>
      {inv.status === 'rejected' && inv.rejection_reason && <p className="mt-2 text-[13px] text-danger-300 line-clamp-2">{t('inv.f.rejectionReason')}: {inv.rejection_reason}</p>}
      <button type="button" onClick={onOpen} className="btn btn-outline w-full min-h-12 mt-4 border-accent/50 text-accent hover:bg-accent/10" data-inv-open>{t('inv.viewDetails')} <span aria-hidden="true">→</span></button>
    </article>
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
  const returnType = inv.return_type ?? v?.return_type
  // A historical record shows only returns actually credited, never a projection.
  const hasProjection = !inv.is_historical && returnType !== undefined && returnType !== 'none'
  const dt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(intl, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('inv.notSet')
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  const rows: [TKey, React.ReactNode][] = [
    ['inv.reference', inv.reference || inv.id.slice(0, 8).toUpperCase()],
    ['inv.statusLabel', <StatusBadge key="s" status={inv.status} />],
    // A record entered for a past investment shows the investment's own date
    // only; when and how it was entered stays in the admin audit trail.
    ...(inv.is_historical
      ? [['inv.f.investedOn', date(inv.start_date)]] as [TKey, React.ReactNode][]
      : [['inv.f.submitted', dt(inv.created_at)], ['inv.start', date(inv.start_date)]] as [TKey, React.ReactNode][]),
    ['inv.maturity', date(inv.maturity_date)],
    ['inv.duration', v ? durationText(v, t) : t('inv.notSet')],
    ['inv.f.kFee', money(Number(inv.fee_amount))],
  ]
  if (inv.completed_at) rows.push(['inv.f.ended', date(inv.completed_at)])

  // The ledger is the source for actual Profit entries in the timeline.
  type Item = { at: string; title: string; note?: string; dateOnly?: boolean }
  const adjustmentReason = new Map(adjustments.map(a => [a.transaction_id, a.reason]))
  const timeline: Item[] = [
    // A past investment: invested on its own date and ended on its own date
    // (dates only; the record's entry time is not part of the client's view).
    ...(inv.is_historical ? [
      ...(inv.start_date ? [{ at: inv.start_date, title: t('inv.f.investedEv'), dateOnly: true }] : []),
      ...(inv.completed_at ? [{ at: inv.completed_at, title: t(`inv.status.${inv.status}` as TKey), dateOnly: true }] : []),
    ] : []),
    ...events.filter(e => e.from_status !== e.to_status && !inv.is_historical).map(e => ({
      at: e.created_at,
      title: e.to_status === 'active' ? t('inv.f.approvedEv') : e.to_status === 'pending_activation' ? t('inv.f.submitted') : t(`inv.status.${e.to_status}` as TKey),
      note: e.reason && e.to_status === 'rejected' ? e.reason : undefined,
    })),
    ...txs.filter(x => x.kind === 'return' && x.tx?.status === 'completed').map(x => ({
      at: x.tx!.created_at,
      title: x.tx!.direction === 'credit' ? `Profit credited ${signed(Number(x.tx!.amount))}` : x.tx!.direction === 'debit' ? `Profit debited ${signed(-Number(x.tx!.amount))}` : 'Profit ledger entry recorded',
      note: x.tx!.notes || (x.tx!.id ? adjustmentReason.get(x.tx!.id) || undefined : undefined),
    })),
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
            {tile('inv.f.returnTerms', returnTermsText(inv, v, t))}
            {tile('inv.f.expectedReturn', money(expRet))}
            {tile('inv.f.expectedTotal', money(expTotal))}
          </div>
        )}
        {hasProjection && <p className="mt-2 text-xs text-fg-faint">{t('inv.f.projectedNote')}</p>}
        {inv.is_historical && <p className="mt-2 text-xs text-fg-faint">{t('inv.f.historicalNoProjection')}</p>}
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
                <p className="text-xs text-fg-faint">{e.dateOnly ? date(e.at) : dt(e.at)}{e.note ? ` · ${e.note}` : ''}</p>
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
              ['inv.f.returnTerms', returnTermsText(inv, v, t)],
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
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-lg border border-ink-700 flex items-center justify-center text-fg-faint"><IconPie width={17} height={17} /></span>
          <p className="text-[14px] text-fg-muted flex-1 min-w-0">{t('inv.f.noActiveHome')}</p>
          <button onClick={() => go('portfolio')} className="btn btn-outline btn-sm">{t('inv.f.browsePlans')}</button>
        </div>
      ) : (
        <ul className="divide-y divide-ink-700">
          {state.invs.slice(0, 3).map(i => {
            const v = state.versions.get(i.product_version_id)
            const p = profitOf(i), principal = Number(i.principal)
            const tone = p > 0 ? 'price-up' : p < 0 ? 'price-down' : 'text-fg'
            // No projected return for a historical record: only what was credited.
            const exp = i.is_historical ? 0 : Number(i.expected_return || 0)
            return (
              <li key={i.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-fg truncate">{v?.name || t('inv.product')}</p>
                    <p className="text-xs text-fg-faint">{v ? durationText(v, t) : ''} · {date(i.start_date)} → {date(i.maturity_date)}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
                <dl className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                  {([['inv.f.invested', money(principal), 'text-fg'], ['inv.f.returnTerms', returnTermsText(i, v, t), 'text-fg'], ['inv.f.expectedReturn', exp > 0 ? money(exp) : '—', 'text-fg'], ['inv.f.expectedTotal', exp > 0 ? money(Number(i.expected_total || 0)) : '—', 'text-fg']] as [TKey, string, string][]).map(([k, val, cls]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[11px] text-fg-faint truncate">{t(k)}</dt>
                      <dd className={`font-semibold tabular-nums truncate ${cls}`}>{val}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-fg-faint tabular-nums">{t('inv.f.credited')}: <span className={tone}>{signed(p)}</span>{exp > 0 ? ` · ${t('inv.f.projectedNote')}` : ''}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// Compact Overview panel: the client's active investments, or (when there
// are none) the plans currently published, with their stored terms. Same
// endpoint as the Investment Center; no plan, rate or result is invented.
export function InvestmentsMini({ go }: { go: (id: string) => void }) {
  const { t, intl } = useI18n()
  const [state, setState] = useState<{ invs: Investment[]; offers: Version[]; versions: Map<string, Version> } | 'error' | null>(null)
  useEffect(() => {
    let alive = true
    authFetch('/api/client/investments').then(r => readJson<Partial<Data>>(r)).then(raw => {
      if (!alive) return
      if (!Array.isArray(raw.investments) || !Array.isArray(raw.versions)) { setState('error'); return }
      const versions = new Map(raw.versions.map(v => [v.id, v]))
      const offers = (raw.products || []).map(p => p.current_version_id ? versions.get(p.current_version_id) : undefined).filter((v): v is Version => !!v)
      setState({ invs: raw.investments.filter(i => i.status === 'active'), offers, versions })
    }).catch(() => alive && setState('error'))
    return () => { alive = false }
  }, [])
  if (state === 'error') return null // the Investments section shows the full error state
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : t('inv.notSet')
  const showPlans = state !== null && state.invs.length === 0 && state.offers.length > 0
  return (
    <section className="panel ovx-card overflow-hidden" aria-labelledby="ovx-inv" data-ov-investments={state === null ? 'loading' : state.invs.length ? 'active' : showPlans ? 'plans' : 'empty'}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 id="ovx-inv" className="text-[15px] font-semibold text-fg">{showPlans ? t('ov2.plansTitle') : t('inv.f.activeTitle')}</h3>
        <button onClick={() => go('portfolio')} className="text-[13px] text-fg-muted hover:text-fg min-h-8 px-1 whitespace-nowrap">{t('common.viewAll')}</button>
      </div>
      {state === null ? (
        <div className="px-5 pb-5 space-y-2" role="status" aria-label={t('common.loading')}><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
      ) : state.invs.length > 0 ? (
        <ul className="px-3 pb-3 space-y-1.5">
          {state.invs.slice(0, 3).map(i => {
            const v = state.versions.get(i.product_version_id), p = profitOf(i)
            return (
              <li key={i.id}>
                <button onClick={() => go('portfolio')} className="ovx-row w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-sky-500/10 text-sky-300"><IconPie width={16} height={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-fg truncate">{v?.name || t('inv.product')}</span>
                    <span className="block text-[11.5px] text-fg-faint truncate">{t('inv.f.credited')}: <span className={p > 0 ? 'price-up' : p < 0 ? 'price-down' : ''}>{signed(p)}</span> · {date(i.maturity_date)}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13.5px] font-semibold tabular-nums text-fg whitespace-nowrap">{money(Number(i.principal))}</span>
                    <StatusBadge status={i.status} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : showPlans ? (
        <ul className="px-3 pb-3 space-y-1.5" data-ov-plans>
          {state.offers.slice(0, 3).map(v => (
            <li key={v.id}>
              <button onClick={() => go('portfolio')} className="ovx-row w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-accent/10 text-accent"><IconTrend width={16} height={16} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-fg truncate">{v.name}</span>
                  <span className="block text-[11.5px] text-fg-faint truncate">{durationText(v, t)} · {t('ov2.minAmount', { amount: money(Number(v.min_amount)) })}</span>
                </span>
                <span className="text-right shrink-0 max-w-[9rem] text-[12px] text-fg-muted"><span className="block truncate" data-plan-terms>{returnTermsText({}, v, t)}</span><span className="block text-[11.5px] text-accent font-medium whitespace-nowrap">{t('ov2.view')} →</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 pb-5 pt-1 flex flex-wrap items-center gap-3">
          <p className="text-[13.5px] text-fg-muted flex-1 min-w-[12rem]">{t('inv.f.noActiveHome')}</p>
          <button onClick={() => go('portfolio')} className="btn btn-outline btn-sm">{t('inv.f.browsePlans')}</button>
        </div>
      )}
    </section>
  )
}

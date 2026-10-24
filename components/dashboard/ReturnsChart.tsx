'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { AreaChart } from '@/components/markets/Charts'
import { IconTrend } from '@/components/Icons'
import { fmt, type Tx } from './shared'
import { txSign } from '@/lib/txCategory'

const RANGES = [7, 30, 90] as const
type Range = typeof RANGES[number]
const DAY = 86_400_000

// Overview "Profit history": how the client's profit balance changed over the
// chosen period, drawn only from their own completed transactions posted to
// that balance (investment profit, manual profit credits and debits, rewards,
// corrections), by effective date: credits add, debits subtract. Nothing is
// interpolated or projected: the line moves only where a record exists, and
// with no records the panel says so.
export function ReturnsChart({ txs, hasMore, hidden }: { txs: Tx[]; hasMore: boolean; hidden: boolean }) {
  const { t, intl } = useI18n()
  const [days, setDays] = useState<Range>(30)
  const records = useMemo(() => txs
    .filter(x => (x.status === 'completed' || x.status === 'approved') && x.method === 'profit_balance' && txSign(x) !== 0)
    .map(x => ({ at: Date.parse(x.created_at), amount: txSign(x) * Number(x.amount) }))
    .filter(r => Number.isFinite(r.at) && Number.isFinite(r.amount))
    .sort((a, b) => a.at - b.at), [txs])
  const view = useMemo(() => {
    const now = Date.now(), start = now - days * DAY
    const inRange = records.filter(r => r.at >= start && r.at <= now)
    let cum = 0
    const points: [number, number][] = [[start, 0]]
    for (const r of inRange) { cum += r.amount; points.push([r.at, +cum.toFixed(2)]) }
    points.push([now, +cum.toFixed(2)])
    // Older activity not loaded yet: the period may be missing entries.
    const oldest = txs.length ? Math.min(...txs.map(x => Date.parse(x.created_at)).filter(Number.isFinite)) : now
    return { points, total: cum, count: inRange.length, partial: hasMore && oldest > start }
  }, [records, days, txs, hasMore])
  const money = (n: number) => `${n < 0 ? '−' : ''}$${fmt(Math.abs(n))}`
  const dateOf = (ms: number) => new Date(ms).toLocaleDateString(intl, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <section className="panel ovx-card ovx-returns overflow-hidden" aria-labelledby="ov-returns" data-ov-returns={records.length ? (view.count ? 'data' : 'none-in-range') : 'empty'}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4">
        <div className="min-w-0">
          <h3 id="ov-returns" className="text-[15px] font-semibold text-fg">{t('ov2.retTitle')}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-fg-faint">{t('ov2.retSub')}</p>
        </div>
        {records.length > 0 && (
          <div className="seg !p-[3px] shrink-0" role="group" aria-label={t('ov2.retRangeLabel')}>
            {RANGES.map(r => (
              <button key={r} type="button" onClick={() => setDays(r)} aria-pressed={days === r} data-ret-range={r}
                className={`ovx-seg ovx-seg-sm ${days === r ? 'is-on' : ''}`}>{t(r === 7 ? 'ov2.r7' : r === 30 ? 'ov2.r30' : 'ov2.r90')}</button>
            ))}
          </div>
        )}
      </div>
      {records.length === 0 ? (
        <div className="px-4 sm:px-5 pb-5 pt-4 flex items-start gap-3" data-ret-empty>
          <span className="ovx-ret-empty-icon" aria-hidden="true"><IconTrend width={18} height={18} /></span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-fg">{t('ov2.retNone')}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{t('ov2.retNoneBody')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 sm:px-5 pt-3">
            <p className={`text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] tabular-nums leading-none ${view.total > 0 ? 'text-success-300' : 'text-fg'}`} data-ret-total>
              {hidden ? '••••••' : `${view.total > 0 ? '+' : ''}${money(view.total)}`}
            </p>
            <p className="mt-1.5 text-[12px] text-fg-faint">{t('ov2.retInRange', { n: days })} · {t('ov2.retCredits', { n: view.count })}</p>
          </div>
          {view.count === 0 ? (
            <p className="px-4 sm:px-5 py-8 text-[13px] text-fg-muted" data-ret-none-range>{t('ov2.retNoneRange')}</p>
          ) : (
            <div className="ovx-ret-chart px-1 sm:px-2 pt-2" data-ret-chart>
              <AreaChart points={view.points} up={null} color="rgb(var(--accent-hover))" label={t('ov2.retChartLabel')}
                format={n => hidden ? '••••' : money(n)} dateFormat={dateOf} />
            </div>
          )}
          <div className="flex justify-between gap-3 px-4 sm:px-5 pb-3 text-[11px] text-fg-faint tabular-nums" aria-hidden="true">
            <span>{dateOf(view.points[0][0])}</span><span>{dateOf(view.points[view.points.length - 1][0])}</span>
          </div>
          {view.partial && <p className="px-4 sm:px-5 pb-4 -mt-1 text-[11.5px] text-fg-faint" data-ret-partial>{t('ov2.retPartial')}</p>}
        </>
      )}
    </section>
  )
}

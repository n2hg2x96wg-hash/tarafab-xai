import { useMemo, useState } from 'react';
import { getDashboardSeries, type PerformanceRangeKey } from '../../data/performance';
import { PerformanceChart } from '../charts/PerformanceChart';
import { useCountUp } from '../motion/useCountUp';

const RANGES: PerformanceRangeKey[] = ['1W', '1M', '3M', '1Y', 'All'];

const allocation = [
  { label: 'Equities', value: 46, color: 'bg-teal-500' },
  { label: 'Crypto', value: 24, color: 'bg-gold-500' },
  { label: 'Bonds', value: 18, color: 'bg-sky-500' },
  { label: 'Cash', value: 12, color: 'bg-slate-400' },
];

/**
 * Interactive mini portfolio preview for the landing page. Uses the same
 * deterministic mock series as the dashboard (client-2 profile) and is
 * clearly labeled as simulated.
 */
export function DemoPortfolioWidget() {
  const [range, setRange] = useState<PerformanceRangeKey>('3M');
  const fullSeries = useMemo(() => getDashboardSeries('client-2'), []);
  const series = useMemo(() => {
    const sliceDays: Record<PerformanceRangeKey, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 90, All: 90 };
    return fullSeries.slice(-sliceDays[range]);
  }, [fullSeries, range]);

  const latest = series[series.length - 1]?.value ?? 0;
  const first = series[0]?.value ?? latest;
  const changePct = first > 0 ? ((latest - first) / first) * 100 : 0;
  const { ref: valueRef, value: animatedValue } = useCountUp(Math.round(latest), 1200);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-2xl shadow-teal-500/10 backdrop-blur dark:border-navy-600/50 dark:bg-navy-900/90 dark:shadow-black/40">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-navy-700">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold-400" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-teal-400" aria-hidden="true" />
        </div>
        <span className="rounded-full bg-gold-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-500">
          Simulated Portfolio Example
        </span>
      </div>

      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total balance</p>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              <span ref={valueRef}>${animatedValue.toLocaleString('en-US')}</span>
            </p>
          </div>
          <span
            className={`rounded-lg px-2 py-1 text-xs font-bold ${
              changePct >= 0
                ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>

        <div className="mt-3 flex gap-1" role="group" aria-label="Chart time range">
          {RANGES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                range === key
                  ? 'bg-teal-500 text-navy-950'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-slate-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pt-2">
        <PerformanceChart data={series} height={170} />
      </div>

      <div className="border-t border-slate-100 px-5 py-4 dark:border-navy-700">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Allocation</p>
        <div className="flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
          {allocation.map((slice) => (
            <span key={slice.label} className={slice.color} style={{ width: `${slice.value}%` }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {allocation.map((slice) => (
            <li key={slice.label} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${slice.color}`} aria-hidden="true" />
              {slice.label}
              <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">{slice.value}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

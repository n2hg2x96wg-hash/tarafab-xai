import { useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { SimulatedTag } from '../components/ui/SimulatedTag';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { performanceRanges, type PerformanceRangeKey } from '../data/performance';
import { formatPercent } from '../utils/format';

const rangeOptions: PerformanceRangeKey[] = ['1W', '1M', '3M', '1Y', 'All'];

function computeStats(values: number[]) {
  const start = values[0];
  const end = values[values.length - 1];
  const roi = ((end - start) / start) * 100;

  const returns = values.slice(1).map((value, index) => (value - values[index]) / values[index]);
  const mean = returns.reduce((sum, r) => sum + r, 0) / (returns.length || 1);
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length || 1);
  const volatility = Math.sqrt(variance) * 100;

  const days = values.length;
  const growthRate = (Math.pow(end / start, 365 / Math.max(days, 1)) - 1) * 100;

  return { roi, volatility, growthRate };
}

export function Analytics() {
  const [range, setRange] = useState<PerformanceRangeKey>('3M');
  const data = performanceRanges[range];
  const stats = useMemo(() => computeStats(data.map((point) => point.value)), [data]);

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Interactive, simulated portfolio performance across selectable time ranges.
        </p>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">Performance</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-1 dark:border-navy-600/60">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRange(option)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    range === option
                      ? 'bg-teal-500 text-navy-950'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-700'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <SimulatedTag />
          </div>
        </div>
        <PerformanceChart data={data} height={320} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ROI</p>
            <SimulatedTag />
          </div>
          <p className={`mt-3 text-2xl font-bold ${stats.roi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatPercent(stats.roi)}
          </p>
          <p className="text-xs text-slate-400">Return over selected range</p>
        </Card>
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Volatility</p>
            <SimulatedTag />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{stats.volatility.toFixed(2)}%</p>
          <p className="text-xs text-slate-400">Simulated daily fluctuation</p>
        </Card>
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Growth Rate</p>
            <SimulatedTag />
          </div>
          <p className={`mt-3 text-2xl font-bold ${stats.growthRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatPercent(stats.growthRate)}
          </p>
          <p className="text-xs text-slate-400">Annualized simulated rate</p>
        </Card>
      </div>

      <Card className="border-teal-500/20 bg-teal-500/5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          All analytics above are computed from fictional, locally generated mock time-series data. They do not
          reflect real market performance and should not be used to make real financial decisions.
        </p>
      </Card>
    </div>
  );
}

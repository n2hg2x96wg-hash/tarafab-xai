import { Card } from '../components/ui/Card';
import { SimulatedTag } from '../components/ui/SimulatedTag';
import { AllocationDonut } from '../components/charts/AllocationDonut';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { assetAllocations, portfolioStats } from '../data/portfolio';
import { dashboardSeries } from '../data/performance';
import { formatCurrency, formatPercent } from '../utils/format';
import { useAppSettings } from '../context/AppSettingsContext';

export function Portfolio() {
  const { currency } = useAppSettings();

  const statCards = [
    { label: 'Total Value', value: formatCurrency(portfolioStats.totalValue, currency) },
    { label: 'Best Performer', value: portfolioStats.bestPerformer, sub: formatPercent(portfolioStats.bestPerformerReturn), tone: 'text-emerald-500' },
    { label: 'Worst Performer', value: portfolioStats.worstPerformer, sub: formatPercent(portfolioStats.worstPerformerReturn), tone: 'text-rose-500' },
    { label: 'Diversification Score', value: `${portfolioStats.diversificationScore}/100` },
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Portfolio</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          A simulated breakdown of your demo asset allocation and performance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} hoverable>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <SimulatedTag />
            </div>
            <p className="mt-3 truncate text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
            {stat.sub && <p className={`text-sm font-semibold ${stat.tone}`}>{stat.sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Asset Allocation</h2>
            <SimulatedTag />
          </div>
          <AllocationDonut data={assetAllocations} />
          <ul className="mt-4 flex flex-wrap gap-3 text-xs">
            {assetAllocations.map((asset) => (
              <li key={asset.name} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: asset.color }} />
                {asset.name}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Performance History</h2>
            <SimulatedTag />
          </div>
          <PerformanceChart data={dashboardSeries} />
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">Allocation Breakdown</h2>
          <SimulatedTag />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-400 dark:border-navy-600/60">
                <th className="py-2 font-medium">Asset Class</th>
                <th className="py-2 font-medium">Value</th>
                <th className="py-2 font-medium">Allocation</th>
                <th className="py-2 font-medium">24h Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-600/60">
              {assetAllocations.map((asset) => (
                <tr key={asset.name}>
                  <td className="py-3 font-medium text-slate-800 dark:text-slate-100">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: asset.color }} />
                    {asset.name}
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{formatCurrency(asset.value, currency)}</td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{asset.percentage.toFixed(1)}%</td>
                  <td className={`py-3 font-medium ${asset.change24h > 0 ? 'text-emerald-500' : asset.change24h < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                    {formatPercent(asset.change24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

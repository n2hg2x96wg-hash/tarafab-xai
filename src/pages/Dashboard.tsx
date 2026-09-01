import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SimulatedTag } from '../components/ui/SimulatedTag';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { portfolioStats } from '../data/portfolio';
import { transactions } from '../data/transactions';
import { dashboardSeries } from '../data/performance';
import { investmentPlans } from '../data/investments';
import { formatCurrency, formatDate, formatPercent } from '../utils/format';
import { useAppSettings } from '../context/AppSettingsContext';

const statusTone = {
  Completed: 'success',
  Pending: 'warning',
  Failed: 'danger',
} as const;

export function Dashboard() {
  const { currency } = useAppSettings();
  const isProfit = portfolioStats.profitLoss >= 0;
  const recentTransactions = transactions.slice(0, 5);
  const activityPlans = investmentPlans.slice(0, 3);

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          A snapshot of your simulated portfolio and recent activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Portfolio Balance</p>
            <SimulatedTag />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(portfolioStats.totalValue, currency)}
          </p>
        </Card>
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Invested</p>
            <SimulatedTag />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(portfolioStats.totalInvested, currency)}
          </p>
        </Card>
        <Card hoverable>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Profit / Loss</p>
            <SimulatedTag />
          </div>
          <p className={`mt-3 text-2xl font-bold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isProfit ? '+' : ''}
            {formatCurrency(portfolioStats.profitLoss, currency)}{' '}
            <span className="text-base font-semibold">({formatPercent(portfolioStats.profitLossPercent)})</span>
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Portfolio Performance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Simulated value over the last 90 days</p>
          </div>
          <SimulatedTag />
        </div>
        <PerformanceChart data={dashboardSeries} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400">
              View all
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-navy-600/60">
            {recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{tx.description}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(tx.date)} · {tx.type}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-sm font-semibold ${tx.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tx.amount >= 0 ? '+' : ''}
                    {formatCurrency(tx.amount, currency)}
                  </span>
                  <Badge tone={statusTone[tx.status]}>{tx.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Investment Activity</h2>
            <Link to="/investments" className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400">
              Explore plans
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {activityPlans.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-navy-600/60"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{plan.name}</p>
                  <p className="text-xs text-slate-400">{plan.returnRange}</p>
                </div>
                <Badge tone={plan.risk === 'Low' ? 'success' : plan.risk === 'Medium' ? 'warning' : 'danger'}>
                  {plan.risk} Risk
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

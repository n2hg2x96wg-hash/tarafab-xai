import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Link } from 'react-router-dom';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';
import { useEffect, useState } from 'react';
import api from '../context/ApiContext';

interface AdminStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingTransactions: number;
  platformBalance: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/api/admin/stats')
      .then((response) => {
        if (active) setStats(response.data);
      })
      .catch((err) => {
        console.error('Failed to load admin statistics:', err);
        if (active) setError('Live statistics are unavailable.');
      });
    return () => { active = false; };
  }, []);

  const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const statCards = stats ? [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), change: 'Registered accounts' },
    { label: 'Completed Deposits', value: money(stats.totalDeposits), change: 'Verified ledger activity' },
    { label: 'Completed Withdrawals', value: money(stats.totalWithdrawals), change: 'Completed ledger activity' },
    { label: 'Pending Transactions', value: stats.pendingTransactions.toLocaleString(), change: 'Awaiting review' },
  ] : [];

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Admin Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400">Platform operations and account management</p>
          </div>
          <AdminLogoutButton />
        </div>

        {error && <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.length === 0 ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-6"><div className="h-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /></Card>
            ))
          ) : statCards.map((stat) => (
            <Card key={stat.label} className="p-6">
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">{stat.label}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">{stat.change}</p>
            </Card>
          ))}
        </div>

        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Platform Balance</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Completed deposits less completed withdrawals.</p>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats ? money(stats.platformBalance) : '—'}</p>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Link to="/admin/users">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center"><span className="text-2xl">👥</span></div><h3 className="text-lg font-semibold text-slate-900 dark:text-white">User Management</h3></div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">View and edit authenticated user accounts.</p>
              <Badge tone="neutral">{stats ? `${stats.totalUsers.toLocaleString()} users` : 'Loading'}</Badge>
            </Card>
          </Link>

          <Link to="/admin/investments">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center"><span className="text-2xl">📈</span></div><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Investments</h3></div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Review supported investment records and operations.</p>
              <Badge tone="neutral">Backend data only</Badge>
            </Card>
          </Link>

          <Link to="/admin/settings">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center"><span className="text-2xl">⚙️</span></div><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h3></div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Platform configuration and operational controls.</p>
              <Badge tone="neutral">System settings</Badge>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

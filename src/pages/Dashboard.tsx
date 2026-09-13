import { useEffect, useState } from 'react';
import { api } from '../context/ApiContext';
import type { DashboardData } from '../types';

const DashboardPage = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await api.get('/api/dashboard/data');
        setDashboardData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-shimmer w-full max-w-4xl h-96 rounded-xl" /></div>;
  if (error) return <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>;
  if (!dashboardData) return null;

  const { account, performance, recentTransactions } = dashboardData;
  const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      <div><h1 className="text-3xl font-bold">Dashboard</h1><p className="text-slate-400 mt-1">Welcome back! Here's your account overview.</p></div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          ['Account Balance', account.accountBalance, 'USD'],
          ['Available', account.availableBalance, 'Ready to use'],
          ['Invested', account.investedBalance, 'In holdings'],
          ['Pending', account.pendingBalance, 'Awaiting confirmation'],
        ].map(([label, value, note]) => (
          <div key={String(label)} className="glass rounded-xl p-6">
            <p className="text-slate-400 text-sm mb-2">{label}</p><p className="text-3xl font-bold">{money(Number(value))}</p><p className="text-slate-500 text-sm mt-2">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass rounded-xl p-6 min-h-[300px]">
          <h2 className="text-lg font-semibold mb-4">Portfolio Performance</h2>
          <div className="h-56 flex items-center justify-center rounded-lg border border-white/10 text-center px-6">
            <p className="text-slate-400 text-sm max-w-md">Historical performance will appear here when verified portfolio history is available.</p>
          </div>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Performance</h2>
          {performance ? <><p className="text-slate-400 text-sm">Verified portfolio return</p><p className="text-slate-300 text-sm mt-2">{performance.profitPercentage}%</p></> : <p className="text-slate-400 text-sm">No verified performance data available.</p>}
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        {recentTransactions.length === 0 ? <p className="text-slate-400 text-sm">No transactions yet.</p> : <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10"><th className="text-left py-3 px-4 text-slate-400 font-medium">Type</th><th className="text-left py-3 px-4 text-slate-400 font-medium">Amount</th><th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th><th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th></tr></thead><tbody>{recentTransactions.map((tx) => <tr key={tx.id} className="border-b border-white/5"><td className="py-3 px-4 capitalize">{tx.type.replace('_', ' ')}</td><td className="py-3 px-4 font-medium">{money(tx.amount)}</td><td className="py-3 px-4"><span className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-300">{tx.status}</span></td><td className="py-3 px-4 text-slate-400 text-sm">{new Date(tx.timestamp).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  );
};

export default DashboardPage;

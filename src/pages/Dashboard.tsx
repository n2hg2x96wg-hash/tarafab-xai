import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../context/ApiContext';
import type { DashboardData } from '../types';

const ranges = ['7D', '30D', '90D'] as const;
type Range = (typeof ranges)[number];

const DashboardPage = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('30D');

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

  const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const activityData = useMemo(() => {
    if (!dashboardData) return [];
    const transactions = [...dashboardData.recentTransactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    let running = dashboardData.account.availableBalance;
    return transactions.slice(-8).map((tx) => {
      const incoming = tx.type === 'deposit' || tx.type === 'transfer_in' || tx.type === 'return';
      if (tx.status === 'completed') running += incoming ? tx.amount : -tx.amount;
      return { date: new Date(tx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: Math.max(0, running) };
    });
  }, [dashboardData, range]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-full max-w-5xl space-y-5 px-6"><div className="skeleton h-10 w-64 rounded-xl" /><div className="grid md:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div><div className="skeleton h-80 rounded-2xl" /></div></div>;
  if (error) return <div className="glass rounded-2xl p-6 border border-red-500/30 text-red-300">{error}</div>;
  if (!dashboardData) return null;

  const { account, performance, recentTransactions } = dashboardData;
  const stats = [
    ['Account Balance', account.accountBalance, 'Total account value', 'from-amber-400 to-orange-500'],
    ['Available', account.availableBalance, 'Ready to use', 'from-cyan-400 to-blue-500'],
    ['Invested', account.investedBalance, 'In holdings', 'from-violet-400 to-fuchsia-500'],
    ['Pending', account.pendingBalance, 'Awaiting confirmation', 'from-emerald-400 to-teal-500'],
  ] as const;

  return (
    <div className="space-y-7 pb-10 animate-page-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 mb-3"><span className="live-dot" /> Account live</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Good to see you back.</h1>
          <p className="text-slate-400 mt-2">Your account overview, activity and verified records in one place.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/deposits" className="action-button primary">Add funds <span>↗</span></Link>
          <Link to="/transfers" className="action-button">Transfer <span>→</span></Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(([label, value, note, gradient], index) => (
          <div key={label} className="glass stat-card rounded-2xl p-5 animate-stagger" style={{ animationDelay: `${index * 80}ms` }}>
            <div className="flex items-center justify-between mb-5"><p className="text-slate-400 text-sm">{label}</p><span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${gradient} shadow-lg`} /></div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight">{money(Number(value))}</p>
            <p className="text-slate-500 text-xs mt-2">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1.65fr_0.8fr] gap-5">
        <section className="glass rounded-2xl p-5 md:p-6 chart-shell">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div><h2 className="text-lg font-semibold">Account activity</h2><p className="text-slate-500 text-xs mt-1">Activity visualization based on recorded completed transactions.</p></div>
            <div className="range-switch">{ranges.map((item) => <button key={item} onClick={() => setRange(item)} className={range === item ? 'active' : ''}>{item}</button>)}</div>
          </div>
          <div className="h-72">
            {activityData.length > 1 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={activityData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
              <defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Tooltip contentStyle={{ background: '#0b1020', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#fff' }} formatter={(value) => [money(Number(value)), 'Activity balance']} />
              <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2.5} fill="url(#activityFill)" isAnimationActive />
            </AreaChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-white/10"><div className="text-center"><div className="text-3xl mb-2">⌁</div><p className="text-slate-400 text-sm">More completed activity is needed to draw a meaningful chart.</p></div></div>}
          </div>
        </section>

        <section className="glass rounded-2xl p-6 relative overflow-hidden">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="relative z-10"><div className="flex items-center justify-between mb-7"><h2 className="text-lg font-semibold">Verified performance</h2><span className="badge">VERIFIED</span></div>
            {performance ? <><p className="text-slate-400 text-sm">Recorded portfolio return</p><p className="text-4xl font-bold mt-2 gradient-text">{performance.profitPercentage}%</p><p className="text-slate-500 text-sm mt-2">Total recorded result: {money(performance.totalProfit)}</p></> : <><div className="text-5xl font-bold text-slate-700">—</div><p className="text-slate-400 text-sm mt-3">No verified performance data available.</p></>}
            <div className="mt-8 pt-6 border-t border-white/10"><p className="text-xs uppercase tracking-wider text-slate-500 mb-3">Quick actions</p><div className="grid grid-cols-2 gap-2"><Link to="/transactions" className="quick-link">Transactions <span>↗</span></Link><Link to="/profile" className="quick-link">Profile <span>↗</span></Link></div></div>
          </div>
        </section>
      </div>

      <section className="glass rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-5"><div><h2 className="text-lg font-semibold">Recent transactions</h2><p className="text-slate-500 text-xs mt-1">Latest recorded account activity.</p></div><Link to="/transactions" className="text-sm text-orange-300 hover:text-orange-200">View all →</Link></div>
        {recentTransactions.length === 0 ? <div className="py-12 text-center text-slate-500">No transactions yet.</div> : <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10"><th className="text-left py-3 px-3 text-slate-500 text-xs uppercase tracking-wider">Type</th><th className="text-left py-3 px-3 text-slate-500 text-xs uppercase tracking-wider">Amount</th><th className="text-left py-3 px-3 text-slate-500 text-xs uppercase tracking-wider">Status</th><th className="text-left py-3 px-3 text-slate-500 text-xs uppercase tracking-wider">Date</th></tr></thead><tbody>{recentTransactions.slice(0, 6).map((tx, index) => <tr key={tx.id} className="table-row animate-stagger" style={{ animationDelay: `${index * 50}ms` }}><td className="py-4 px-3 capitalize font-medium">{tx.type.replace('_', ' ')}</td><td className="py-4 px-3 font-semibold">{money(tx.amount)}</td><td className="py-4 px-3"><span className={`status-pill ${tx.status === 'completed' ? 'success' : tx.status === 'failed' || tx.status === 'rejected' ? 'danger' : 'pending'}`}>{tx.status.replace('_', ' ')}</span></td><td className="py-4 px-3 text-slate-500 text-sm">{new Date(tx.timestamp).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
};

export default DashboardPage;

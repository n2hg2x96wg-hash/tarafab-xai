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
      try { const response = await api.get('/api/dashboard/data'); setDashboardData(response.data); }
      catch (err: any) { setError(err.response?.data?.error || 'Failed to load dashboard'); }
      finally { setLoading(false); }
    };
    fetchDashboard();
  }, []);

  const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const activityData = useMemo(() => {
    if (!dashboardData) return [];
    const transactions = [...dashboardData.recentTransactions].sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
    let running = dashboardData.account.availableBalance;
    return transactions.slice(-8).map(tx => { const incoming=tx.type==='deposit'||tx.type==='transfer_in'||tx.type==='return'; if(tx.status==='completed') running += incoming ? tx.amount : -tx.amount; return {date:new Date(tx.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'}),value:Math.max(0,running)}; });
  }, [dashboardData, range]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-full max-w-6xl space-y-5 px-6"><div className="skeleton h-12 w-72 rounded-2xl" /><div className="grid md:grid-cols-4 gap-4">{[1,2,3,4].map(i=><div key={i} className="skeleton h-40 rounded-3xl" />)}</div><div className="skeleton h-96 rounded-3xl" /></div></div>;
  if (error) return <div className="glass rounded-3xl p-7 border border-rose-500/30 text-rose-300">{error}</div>;
  if (!dashboardData) return null;

  const { account, performance, recentTransactions } = dashboardData;
  const stats = [
    ['Account Balance', account.accountBalance, 'Total account value', 'from-violet-500 to-fuchsia-500', '◈'],
    ['Available', account.availableBalance, 'Ready to use', 'from-cyan-400 to-blue-500', '◎'],
    ['Invested', account.investedBalance, 'In holdings', 'from-fuchsia-400 to-pink-500', '◇'],
    ['Pending', account.pendingBalance, 'Awaiting confirmation', 'from-indigo-400 to-violet-500', '⌁'],
  ] as const;

  return <div className="space-y-7 pb-12 animate-page-in">
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
      <div><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-cyan-300 mb-3"><span className="live-dot" /> System live</div><h1 className="text-4xl md:text-5xl font-bold tracking-[-.03em]">Command center.</h1><p className="text-slate-400 mt-2 max-w-xl">Your account overview, recorded activity and controls—designed as one live workspace.</p></div>
      <div className="flex gap-3"><Link to="/deposits" className="action-button primary">Add funds <span>↗</span></Link><Link to="/transfers" className="action-button">Transfer <span>→</span></Link></div>
    </div>

    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{stats.map(([label,value,note,gradient,icon],index)=><div key={label} className="glass stat-card rounded-3xl p-5 animate-stagger" style={{animationDelay:`${index*90}ms`}}><div className="flex items-center justify-between"><div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${gradient} bg-opacity-20 flex items-center justify-center text-white text-lg shadow-lg`}>{icon}</div><span className="text-[9px] tracking-[.15em] text-slate-600">LIVE</span></div><p className="text-slate-400 text-xs uppercase tracking-wider mt-7">{label}</p><p className="text-2xl md:text-[28px] font-bold tracking-tight mt-1">{money(Number(value))}</p><p className="text-slate-500 text-xs mt-2">{note}</p></div>)}</div>

    <div className="grid xl:grid-cols-[1.7fr_.75fr] gap-5">
      <section className="glass rounded-3xl p-5 md:p-7 chart-shell">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"><div><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(32,217,255,.8)]" /><h2 className="text-lg font-semibold">Activity signal</h2></div><p className="text-slate-500 text-xs mt-1">Recorded completed transactions only.</p></div><div className="range-switch">{ranges.map(item=><button key={item} onClick={()=>setRange(item)} className={range===item?'active':''}>{item}</button>)}</div></div>
        <div className="h-80">{activityData.length>1?<ResponsiveContainer width="100%" height="100%"><AreaChart data={activityData} margin={{top:15,right:8,left:-18,bottom:0}}><defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c5cff" stopOpacity={.4}/><stop offset="55%" stopColor="#20d9ff" stopOpacity={.16}/><stop offset="100%" stopColor="#7c5cff" stopOpacity={0}/></linearGradient><linearGradient id="activityStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#7c5cff"/><stop offset="55%" stopColor="#20d9ff"/><stop offset="100%" stopColor="#ff4fd8"/></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="date" tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`$${Number(v).toLocaleString()}`}/><Tooltip contentStyle={{background:'#080c1b',border:'1px solid rgba(124,92,255,.3)',borderRadius:16,color:'#fff',boxShadow:'0 20px 50px rgba(0,0,0,.35)'}} formatter={value=>[money(Number(value)),'Activity balance']}/><Area type="monotone" dataKey="value" stroke="url(#activityStroke)" strokeWidth={3} fill="url(#activityFill)" isAnimationActive/></AreaChart></ResponsiveContainer>:<div className="h-full flex items-center justify-center rounded-2xl border border-dashed border-white/10"><div className="text-center"><div className="text-3xl text-cyan-300 mb-2">⌁</div><p className="text-slate-400 text-sm">More completed activity is needed to draw a meaningful chart.</p></div></div>}</div>
      </section>

      <section className="glass rounded-3xl p-6 relative overflow-hidden"><div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-violet-500/10 blur-3xl" /><div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-cyan-400/10 blur-3xl" /><div className="relative z-10"><div className="flex items-center justify-between mb-8"><h2 className="text-lg font-semibold">Performance</h2><span className="badge">VERIFIED</span></div>{performance?<><p className="text-slate-400 text-sm">Recorded portfolio return</p><p className="text-5xl font-bold mt-2 gradient-text">{performance.profitPercentage}%</p><p className="text-slate-500 text-sm mt-2">Total recorded result: {money(performance.totalProfit)}</p></>:<><div className="text-5xl font-bold text-slate-700">—</div><p className="text-slate-400 text-sm mt-3">No verified performance data available.</p></>}<div className="mt-9 pt-6 border-t border-white/10"><p className="text-[10px] uppercase tracking-[.18em] text-slate-500 mb-3">Quick navigation</p><div className="grid grid-cols-2 gap-2"><Link to="/transactions" className="quick-link">Transactions <span>↗</span></Link><Link to="/profile" className="quick-link">Profile <span>↗</span></Link></div></div></div></section>
    </div>

    <section className="glass rounded-3xl p-5 md:p-7"><div className="flex items-center justify-between mb-5"><div><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_14px_rgba(124,92,255,.8)]"/><h2 className="text-lg font-semibold">Recent transactions</h2></div><p className="text-slate-500 text-xs mt-1">Latest recorded account activity.</p></div><Link to="/transactions" className="text-sm text-cyan-300 hover:text-white">View all →</Link></div>{recentTransactions.length===0?<div className="py-12 text-center text-slate-500">No transactions yet.</div>:<div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10"><th className="text-left py-3 px-3 text-slate-500 text-[10px] uppercase tracking-[.15em]">Type</th><th className="text-left py-3 px-3 text-slate-500 text-[10px] uppercase tracking-[.15em]">Amount</th><th className="text-left py-3 px-3 text-slate-500 text-[10px] uppercase tracking-[.15em]">Status</th><th className="text-left py-3 px-3 text-slate-500 text-[10px] uppercase tracking-[.15em]">Date</th></tr></thead><tbody>{recentTransactions.slice(0,6).map((tx,index)=><tr key={tx.id} className="table-row animate-stagger" style={{animationDelay:`${index*50}ms`}}><td className="py-4 px-3 capitalize font-medium">{tx.type.replace('_',' ')}</td><td className="py-4 px-3 font-semibold">{money(tx.amount)}</td><td className="py-4 px-3"><span className={`status-pill ${tx.status==='completed'?'success':tx.status==='failed'||tx.status==='rejected'?'danger':'pending'}`}>{tx.status.replace('_',' ')}</span></td><td className="py-4 px-3 text-slate-500 text-sm">{new Date(tx.timestamp).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
  </div>;
};

export default DashboardPage;

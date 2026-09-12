import React, { useState, useEffect } from 'react';
import { api } from '../context/ApiContext';
import { Account, Transaction, DashboardData } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-shimmer w-full max-w-4xl h-96 rounded-xl"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
        {error}
      </div>
    );
  }

  if (!dashboardData) return null;

  const { account, performance, recentTransactions } = dashboardData;

  // Generate mock chart data
  const chartData = [
    { date: '1W ago', value: account.accountBalance * 0.85 },
    { date: '5d ago', value: account.accountBalance * 0.88 },
    { date: '3d ago', value: account.accountBalance * 0.92 },
    { date: '2d ago', value: account.accountBalance * 0.95 },
    { date: 'Yesterday', value: account.accountBalance * 0.98 },
    { date: 'Today', value: account.accountBalance },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-400 mt-1">Welcome back! Here's your account overview.</p>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-6">
          <p className="text-slate-400 text-sm mb-2">Account Balance</p>
          <p className="text-3xl font-bold">${account.accountBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          <p className="text-slate-500 text-sm mt-2">USD</p>
        </div>
        <div className="glass rounded-xl p-6">
          <p className="text-slate-400 text-sm mb-2">Available</p>
          <p className="text-3xl font-bold text-green-400">${account.availableBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          <p className="text-slate-500 text-sm mt-2">Ready to trade</p>
        </div>
        <div className="glass rounded-xl p-6">
          <p className="text-slate-400 text-sm mb-2">Invested</p>
          <p className="text-3xl font-bold text-blue-400">${account.investedBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          <p className="text-slate-500 text-sm mt-2">In holdings</p>
        </div>
        <div className="glass rounded-xl p-6">
          <p className="text-slate-400 text-sm mb-2">Pending</p>
          <p className="text-3xl font-bold text-yellow-400">${account.pendingBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          <p className="text-slate-500 text-sm mt-2">Awaiting confirmation</p>
        </div>
      </div>

      {/* Performance Section */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Portfolio Performance</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f97316"
                fillOpacity={1}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Performance</h2>
          <div className="space-y-4">
            <div>
              <p className="text-slate-400 text-sm">Total Profit</p>
              <p className={`text-2xl font-bold ${performance.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${Math.abs(performance.totalProfit).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Return %</p>
              <p className={`text-2xl font-bold ${parseFloat(performance.profitPercentage) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {performance.profitPercentage}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Type</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Amount</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-3 px-4 capitalize">{tx.type.replace('_', ' ')}</td>
                  <td className="py-3 px-4 font-medium">${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className="py-3 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      tx.status === 'completed'
                        ? 'bg-green-500/10 text-green-400'
                        : tx.status === 'failed'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-sm">{new Date(tx.timestamp).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

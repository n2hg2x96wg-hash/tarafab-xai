import { useState, useEffect } from 'react';
import { api } from '../context/ApiContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { getSupabaseTransactions } from '../lib/supabaseData';
import type { Transaction } from '../types';

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      setError('');
      try {
        const nextTransactions = isSupabaseConfigured
          ? await getSupabaseTransactions(filter)
          : (await api.get('/api/transactions', { params: { limit: 100, ...(filter !== 'all' ? { type: filter } : {}) } })).data.transactions;
        setTransactions(nextTransactions);
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };
    void fetchTransactions();
  }, [filter]);

  const filteredTransactions = transactions.filter((tx) => {
    const query = searchTerm.toLowerCase().trim();
    return !query || tx.reference?.toLowerCase().includes(query) || tx.type.toLowerCase().includes(query);
  });

  const isOutgoing = (tx: Transaction) => tx.type === 'transfer_out' || tx.type === 'withdrawal' || (tx.type === 'return' && tx.amount < 0);
  const displayAmount = (tx: Transaction) => Math.abs(Number(tx.amount));

  if (loading) return <div className="animate-shimmer w-full h-96 rounded-xl" aria-label="Loading transactions" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-slate-400 mt-1">View your transaction history and details.</p>
      </div>
      {error && <div role="alert" className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}
      <div className="flex flex-col md:flex-row gap-4">
        <label className="sr-only" htmlFor="transaction-search">Search transactions</label>
        <input id="transaction-search" type="text" placeholder="Search transactions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500" />
        <label className="sr-only" htmlFor="transaction-filter">Filter transactions</label>
        <select id="transaction-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white">
          <option value="all">All Transactions</option>
          <option value="deposit">Deposits</option>
          <option value="withdrawal">Withdrawals</option>
          <option value="transfer_out">Transfers Out</option>
          <option value="transfer_in">Transfers In</option>
        </select>
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-white/10"><th className="text-left py-4 px-6 text-slate-400 font-medium">Type</th><th className="text-left py-4 px-6 text-slate-400 font-medium">Amount</th><th className="text-left py-4 px-6 text-slate-400 font-medium">Fee</th><th className="text-left py-4 px-6 text-slate-400 font-medium">Status</th><th className="text-left py-4 px-6 text-slate-400 font-medium">Date</th></tr></thead>
            <tbody>
              {filteredTransactions.length > 0 ? filteredTransactions.map((tx) => {
                const outgoing = isOutgoing(tx);
                const amount = displayAmount(tx);
                return <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition"><td className="py-4 px-6 capitalize">{tx.type.replace(/_/g, ' ')}</td><td className="py-4 px-6 font-medium"><span className={outgoing ? 'text-red-400' : 'text-green-400'}>{outgoing ? '-' : '+'}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></td><td className="py-4 px-6 text-slate-400">${Number(tx.fee).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td><td className="py-4 px-6"><span className={`px-3 py-1 rounded-full text-xs font-medium ${tx.status === 'completed' ? 'bg-green-500/10 text-green-400' : tx.status === 'rejected' || tx.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{tx.status}</span></td><td className="py-4 px-6 text-slate-400 text-sm">{new Date(tx.timestamp).toLocaleString()}</td></tr>;
              }) : <tr><td colSpan={5} className="py-8 px-6 text-center text-slate-400">No transactions found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransactionsPage;

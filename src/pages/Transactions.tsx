import { useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SimulatedTag } from '../components/ui/SimulatedTag';
import { transactions, type TransactionStatus, type TransactionType } from '../data/transactions';
import { formatCurrency, formatDate } from '../utils/format';
import { useAppSettings } from '../context/AppSettingsContext';

const statusTone = {
  Completed: 'success',
  Pending: 'warning',
  Failed: 'danger',
} as const;

const typeOptions: Array<TransactionType | 'All'> = ['All', 'Deposit', 'Withdrawal', 'Investment', 'Return'];
const statusOptions: Array<TransactionStatus | 'All'> = ['All', 'Completed', 'Pending', 'Failed'];

export function Transactions() {
  const { currency } = useAppSettings();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'All'>('All');

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesQuery = tx.description.toLowerCase().includes(query.toLowerCase());
      const matchesType = typeFilter === 'All' || tx.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || tx.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [query, typeFilter, statusFilter]);

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Mock deposits, withdrawals, investments, and returns.</p>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transactions..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-teal-500 md:max-w-xs dark:border-navy-500 dark:bg-navy-700 dark:text-slate-100"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TransactionType | 'All')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700 dark:text-slate-100"
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'All' ? 'All Types' : option}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as TransactionStatus | 'All')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700 dark:text-slate-100"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'All' ? 'All Statuses' : option}
                </option>
              ))}
            </select>
            <SimulatedTag />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-400 dark:border-navy-600/60">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-600/60">
              {filtered.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(tx.date)}</td>
                  <td className="py-3 text-slate-700 dark:text-slate-200">{tx.type}</td>
                  <td className="py-3 text-slate-700 dark:text-slate-200">{tx.description}</td>
                  <td className={`py-3 font-semibold whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tx.amount >= 0 ? '+' : ''}
                    {formatCurrency(tx.amount, currency)}
                  </td>
                  <td className="py-3">
                    <Badge tone={statusTone[tx.status]}>{tx.status}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import React, { useState } from 'react';
import { api } from '../context/ApiContext';

type WithdrawalMethod = 'bitcoin' | 'bank_transfer';
const MAX_WITHDRAWAL_AMOUNT = 1_000_000;

const WithdrawalsPage = () => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<WithdrawalMethod>('bitcoin');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('mainnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > MAX_WITHDRAWAL_AMOUNT || Math.round(numericAmount * 100) !== numericAmount * 100) {
      setError('Enter a valid amount with up to 2 decimal places, not exceeding $1,000,000.');
      return;
    }
    if (!address.trim()) {
      setError('Please enter a withdrawal destination.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/api/withdrawals/initiate', {
        method,
        amount: numericAmount,
        address: address.trim(),
        network: method === 'bitcoin' ? network : undefined,
      });
      setSuccess(`Withdrawal request submitted. Reference: ${response.data.withdrawalId || 'pending'}. Status: ${response.data.status || 'pending review'}. Completion requires backend review and settlement.`);
      setAmount('');
      setAddress('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate withdrawal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div><h1 className="text-3xl font-bold">Withdraw Funds</h1><p className="text-slate-400 mt-1">Request a withdrawal from your available balance.</p></div>
      <div className="max-w-2xl mx-auto glass rounded-xl p-8">
        {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}
        {success && <div role="status" className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">{success}</div>}
        <form onSubmit={handleWithdraw} className="space-y-6">
          <div><label className="block text-sm font-medium mb-3">Withdrawal Method</label><div className="space-y-2">{[{ value: 'bitcoin' as const, label: '₿ Bitcoin Wallet' }, { value: 'bank_transfer' as const, label: '🏦 Bank Transfer' }].map((opt) => <label key={opt.value} className="flex items-center p-3 rounded-lg border border-white/10 cursor-pointer"><input type="radio" value={opt.value} checked={method === opt.value} onChange={(e) => { setMethod(e.target.value as WithdrawalMethod); setAddress(''); }} className="w-4 h-4" /><span className="ml-3">{opt.label}</span></label>)}</div></div>
          <div><label htmlFor="withdrawal-amount" className="block text-sm font-medium mb-2">Amount (USD)</label><div className="flex items-center"><span className="text-lg font-medium mr-2">$</span><input id="withdrawal-amount" required min="0.01" max={MAX_WITHDRAWAL_AMOUNT} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="0.01" inputMode="decimal" className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white" /></div></div>
          {method === 'bitcoin' ? <><div><label htmlFor="withdrawal-network" className="block text-sm font-medium mb-2">Bitcoin Network</label><select id="withdrawal-network" value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white"><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></div><div><label htmlFor="bitcoin-address" className="block text-sm font-medium mb-2">Bitcoin Address</label><input id="bitcoin-address" required type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter a supported Bitcoin address" autoComplete="off" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm" /></div></> : <div><label htmlFor="bank-destination" className="block text-sm font-medium mb-2">Supported Bank Destination</label><input id="bank-destination" required type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter the configured bank destination" autoComplete="off" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white" /></div>}
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm">Requests are validated against your available balance and placed into pending review. This screen does not approve withdrawals or guarantee completion.</div>
          <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold disabled:opacity-50">{loading ? 'Submitting...' : 'Request Withdrawal'}</button>
        </form>
      </div>
    </div>
  );
};

export default WithdrawalsPage;

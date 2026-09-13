import React, { useState } from 'react';
import { api } from '../context/ApiContext';

const WithdrawalsPage = () => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bitcoin' | 'bank'>('bitcoin');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('mainnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return setError('Please enter a valid amount');
    if (!address) return setError('Please enter a withdrawal destination');
    setLoading(true); setError(''); setSuccess('');
    try {
      const response = await api.post('/api/withdrawals/initiate', { method, amount: parseFloat(amount), address, network: method === 'bitcoin' ? network : undefined });
      setSuccess(`Withdrawal initiated. ID: ${response.data.withdrawalId}`); setAmount(''); setAddress('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate withdrawal');
    } finally { setLoading(false); }
  };

  return <div className="space-y-8"><div><h1 className="text-3xl font-bold">Withdraw Funds</h1><p className="text-slate-400 mt-1">Transfer money out of your account</p></div><div className="max-w-2xl mx-auto glass rounded-xl p-8">
    {error && <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}
    {success && <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">{success}</div>}
    <form onSubmit={handleWithdraw} className="space-y-6">
      <div><label className="block text-sm font-medium mb-3">Withdrawal Method</label><div className="space-y-2">{[{ value: 'bitcoin', label: '₿ Bitcoin Wallet' }, { value: 'bank', label: '🏦 Bank Account' }].map((opt) => <label key={opt.value} className="flex items-center p-3 rounded-lg border border-white/10 cursor-pointer"><input type="radio" value={opt.value} checked={method === opt.value} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-4 h-4" /><span className="ml-3">{opt.label}</span></label>)}</div></div>
      <div><label className="block text-sm font-medium mb-2">Amount</label><div className="flex items-center"><span className="text-lg font-medium mr-2">$</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="0.01" className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white" /></div></div>
      {method === 'bitcoin' && <><div><label className="block text-sm font-medium mb-2">Bitcoin Network</label><select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white"><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></div><div><label className="block text-sm font-medium mb-2">Bitcoin Address</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="bc1..." className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm" /></div></>}
      {method === 'bank' && <div><label className="block text-sm font-medium mb-2">Withdrawal Destination</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter the supported destination" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white" /></div>}
      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm">Withdrawals are subject to backend validation and review before completion.</div>
      <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold disabled:opacity-50">{loading ? 'Processing...' : 'Request Withdrawal'}</button>
    </form></div></div>;
};
export default WithdrawalsPage;

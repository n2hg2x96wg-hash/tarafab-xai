import React, { useState } from 'react';
import { api } from '../context/ApiContext';

const DepositsPage = () => {
  const [method, setMethod] = useState<'bitcoin' | 'bank_transfer' | 'card'>('bitcoin');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [depositId, setDepositId] = useState<number | null>(null);
  const [depositDetails, setDepositDetails] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState('');

  const handleInitiateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }
    setLoading(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await api.post('/api/deposits/initiate', {
        method,
        amount: parsedAmount,
        asset: method === 'bitcoin' ? 'BTC' : 'USD',
      });
      setDepositDetails(response.data);
      setDepositId(response.data.depositId);
      setStatusMessage('Deposit created and awaiting payment or verification.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate deposit');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitHash = async () => {
    const normalizedHash = transactionHash.trim();
    if (!normalizedHash || !depositId) {
      setError('Please enter a transaction hash.');
      return;
    }
    setLoading(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await api.post('/api/deposits/verify-transaction', {
        depositId,
        transactionHash: normalizedHash,
      });
      setStatusMessage(response.data.message || 'Transaction hash submitted for confirmation.');
      setTransactionHash('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit transaction hash');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Deposit Funds</h1>
        <p className="text-slate-400 mt-1">Start a deposit without treating an unverified payment as confirmed funds.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-6">Select Deposit Method</h2>
          {error && <div role="alert" className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          {statusMessage && <div role="status" className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">{statusMessage}</div>}
          <form onSubmit={handleInitiateDeposit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-3">Payment Method</label>
              <div className="space-y-2">
                {[
                  { value: 'bitcoin', label: '₿ Bitcoin' },
                  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
                  { value: 'card', label: '💳 Credit Card' },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center p-3 rounded-lg border border-white/10 cursor-pointer hover:border-orange-400/50 transition">
                    <input type="radio" value={opt.value} checked={method === opt.value} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-4 h-4" />
                    <span className="ml-3">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="deposit-amount">Requested Amount</label>
              <div className="flex items-center">
                <span className="text-lg font-medium mr-2">$</span>
                <input id="deposit-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="0.01" step="0.01" required className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white" />
              </div>
              <p className="text-xs text-slate-500 mt-2">Enter the requested amount in USD. The backend must verify the actual received asset and value before crediting your account.</p>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold disabled:opacity-50">{loading ? 'Processing...' : 'Continue'}</button>
          </form>
        </div>
        {depositDetails && <div className="glass rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-6">Deposit Details</h2>
          {method === 'bitcoin' && <div className="space-y-6">
            <div>
              <p className="text-slate-400 text-sm mb-2">Bitcoin Receiving Address</p>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 font-mono text-sm break-all">{depositDetails.address || 'Not configured'}</div>
              {depositDetails.address && <button type="button" onClick={() => navigator.clipboard.writeText(depositDetails.address)} className="mt-2 text-sm text-orange-400">Copy Address</button>}
            </div>
            <div><p className="text-slate-400 text-sm mb-2">Requested Amount</p><p className="text-2xl font-bold">${Number(depositDetails.amount || amount).toFixed(2)} USD</p></div>
            <div><p className="text-slate-400 text-sm mb-2">Network</p><p className="text-white capitalize">{depositDetails.network || 'Not specified'}</p></div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="transaction-hash">Transaction Hash</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input id="transaction-hash" type="text" value={transactionHash} onChange={(e) => setTransactionHash(e.target.value)} placeholder="Paste transaction hash (txid)" className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" />
                <button type="button" onClick={handleSubmitHash} disabled={loading || !transactionHash.trim()} className="px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 disabled:opacity-50">Submit</button>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">Submitting a transaction hash only queues it for verification. Your balance must not increase until the backend confirms the transaction.</div>
          </div>}
          {method === 'bank_transfer' && <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">Bank transfer instructions are available when the configured payment provider is enabled.</div>}
          {method === 'card' && <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">Card deposits require a configured payment processor before funds can be accepted.</div>}
        </div>}
      </div>
    </div>
  );
};

export default DepositsPage;

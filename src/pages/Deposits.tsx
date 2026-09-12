import React, { useState } from 'react';
import { api } from '../context/ApiContext';

const DepositsPage = () => {
  const [method, setMethod] = useState<'bitcoin' | 'bank_transfer' | 'card'>('bitcoin');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [depositId, setDepositId] = useState<number | null>(null);
  const [depositDetails, setDepositDetails] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState('');

  const handleInitiateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/deposits/initiate', {
        method,
        amount: parseFloat(amount),
        asset: method === 'bitcoin' ? 'BTC' : 'USD',
      });

      setDepositDetails(response.data);
      setDepositId(response.data.depositId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate deposit');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitHash = async () => {
    if (!transactionHash || !depositId) {
      setError('Please enter a transaction hash');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/deposits/verify-transaction', {
        depositId,
        transactionHash,
      });

      setError('');
      alert('Transaction hash submitted. Please allow time for blockchain confirmation.');
      setTransactionHash('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to verify transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Deposit Funds</h1>
        <p className="text-slate-400 mt-1">Add money to your account</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Deposit Form */}
        <div className="glass rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-6">Select Deposit Method</h2>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

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
                    <input
                      type="radio"
                      value={opt.value}
                      checked={method === opt.value}
                      onChange={(e) => setMethod(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="ml-3">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <div className="flex items-center">
                <span className="text-lg font-medium mr-2">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? 'Processing...' : 'Continue'}
            </button>
          </form>
        </div>

        {/* Deposit Details */}
        {depositDetails && (
          <div className="glass rounded-xl p-8">
            <h2 className="text-xl font-semibold mb-6">Deposit Details</h2>

            {method === 'bitcoin' && (
              <div className="space-y-6">
                <div>
                  <p className="text-slate-400 text-sm mb-2">Bitcoin Address</p>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10 font-mono text-sm break-all">
                    {depositDetails.address}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(depositDetails.address);
                      alert('Address copied to clipboard');
                    }}
                    className="mt-2 text-sm text-orange-400 hover:text-orange-300"
                  >
                    Copy Address
                  </button>
                </div>

                <div>
                  <p className="text-slate-400 text-sm mb-2">Amount (BTC)</p>
                  <p className="text-2xl font-bold">{depositDetails.amount}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm mb-2">Network</p>
                  <p className="text-white capitalize">{depositDetails.network}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Transaction Hash</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={transactionHash}
                      onChange={(e) => setTransactionHash(e.target.value)}
                      placeholder="Paste transaction hash (txid)"
                      className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500 text-sm"
                    />
                    <button
                      onClick={handleSubmitHash}
                      disabled={loading || !transactionHash}
                      className="px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Verify
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                  💡 Send the exact amount to the address above. Confirmations will be verified automatically.
                </div>
              </div>
            )}

            {method === 'bank_transfer' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                  Bank transfer details will be sent to your registered email address. Please allow 1-3 business days for funds to arrive.
                </div>
              </div>
            )}

            {method === 'card' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                  You will be redirected to our payment processor. Credit card deposits have a 2% processing fee.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositsPage;

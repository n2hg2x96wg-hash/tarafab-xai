import React, { useState } from 'react';
import { api } from '../context/ApiContext';

const TransfersPage = () => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipientEmail || !amount || parseFloat(amount) <= 0) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/api/transfers/initiate', {
        recipientEmail,
        amount: parseFloat(amount),
      });

      setSuccess(`Transfer initiated! ID: ${response.data.transferId}`);
      setRecipientEmail('');
      setAmount('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Transfer Funds</h1>
        <p className="text-slate-400 mt-1">Send money to other Tarafab.XAi accounts</p>
      </div>

      <div className="max-w-2xl mx-auto glass rounded-xl p-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
            {success}
          </div>
        )}

        <form onSubmit={handleTransfer} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Recipient Email</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500"
            />
            <p className="text-xs text-slate-400 mt-1">The recipient must have a Tarafab.XAi account</p>
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

          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
            💡 Transfers between accounts are instant and free. The recipient will be notified via email.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Send Transfer'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TransfersPage;

import React, { useState } from 'react';
import { api } from '../context/ApiContext';

const MAX_TRANSFER_AMOUNT = 1_000_000;

const TransfersPage = () => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);

    if (!recipientEmail.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > MAX_TRANSFER_AMOUNT || Math.round(numericAmount * 100) !== numericAmount * 100) {
      setError('Enter a valid recipient email and an amount up to $1,000,000 with no more than 2 decimal places.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/api/transfers/initiate', {
        recipientEmail: recipientEmail.trim().toLowerCase(),
        amount: numericAmount,
      });

      setSuccess(`Transfer request created. Reference: ${response.data.transferId || 'pending'}. Funds are settled only after server-side validation.`);
      setRecipientEmail('');
      setAmount('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to create the transfer request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Transfer Funds</h1>
        <p className="text-slate-400 mt-1">Send funds to another verified Tarafab.XAi account.</p>
      </div>

      <div className="max-w-2xl mx-auto glass rounded-xl p-8">
        {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}
        {success && <div role="status" className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">{success}</div>}

        <form onSubmit={handleTransfer} className="space-y-6">
          <div>
            <label htmlFor="recipient-email" className="block text-sm font-medium mb-2">Recipient Email</label>
            <input id="recipient-email" required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="recipient@example.com" autoComplete="email" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500" />
            <p className="text-xs text-slate-400 mt-1">The recipient must have a verified account. Confirm the email before submitting.</p>
          </div>

          <div>
            <label htmlFor="transfer-amount" className="block text-sm font-medium mb-2">Amount (USD)</label>
            <div className="flex items-center"><span className="text-lg font-medium mr-2">$</span><input id="transfer-amount" required min="0.01" max={MAX_TRANSFER_AMOUNT} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="0.01" inputMode="decimal" className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none text-white placeholder-slate-500" /></div>
            <p className="text-xs text-slate-500 mt-1">Maximum request: $1,000,000.00. Final approval is server-side.</p>
          </div>

          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">Transfers are subject to recipient checks, available-balance validation, fraud controls, and server-side ledger settlement. Fees and timing depend on the configured backend policy; no transfer is considered complete from this screen alone.</div>

          <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Submitting...' : 'Review Transfer Request'}</button>
        </form>
      </div>
    </div>
  );
};

export default TransfersPage;

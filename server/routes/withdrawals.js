import express from 'express';

const router = express.Router();
const SUPPORTED_METHODS = new Set(['bitcoin', 'bank_transfer']);
const MAX_WITHDRAWAL_AMOUNT = 1_000_000;
const SUPPORTED_BITCOIN_NETWORKS = new Set(['mainnet', 'testnet']);

function validText(value, maxLength = 256) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    && parsed > 0
    && parsed <= MAX_WITHDRAWAL_AMOUNT
    && Number.isInteger(Math.round(parsed * 100));
}

// Initiate withdrawal. Funds are reserved immediately and remain pending until an authorized backend process reviews it.
router.post('/initiate', (req, res) => {
  const { method, amount, address, network } = req.body;
  const userId = req.user.userId;
  const parsedAmount = Number(amount);
  const normalizedAddress = typeof address === 'string' ? address.trim() : '';
  const normalizedNetwork = typeof network === 'string' && network.trim() ? network.trim().toLowerCase() : 'mainnet';

  if (!SUPPORTED_METHODS.has(method)
    || !validAmount(parsedAmount)
    || !validText(normalizedAddress)
    || !validText(normalizedNetwork, 64)
    || (method === 'bitcoin' && !SUPPORTED_BITCOIN_NETWORKS.has(normalizedNetwork))) {
    return res.status(400).json({ error: 'Invalid withdrawal parameters' });
  }

  try {
    const createWithdrawal = global.db.transaction(() => {
      const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);

      if (!account || Number(account.availableBalance) < parsedAmount) {
        const error = new Error('Insufficient available balance');
        error.code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      const timestamp = new Date().toISOString();
      const withdrawalResult = global.db
        .prepare(
          'INSERT INTO transactions (userId, type, method, amount, address, network, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(userId, 'withdrawal', method, parsedAmount, normalizedAddress, normalizedNetwork, 'pending_review', timestamp);

      const newAvailable = Number(account.availableBalance) - parsedAmount;
      const newPending = Number(account.pendingBalance || 0) + parsedAmount;

      global.db
        .prepare('UPDATE accounts SET availableBalance = ?, pendingBalance = ?, updatedAt = ? WHERE userId = ?')
        .run(newAvailable, newPending, timestamp, userId);

      global.db
        .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
        .run(userId, 'withdrawal_initiated', JSON.stringify({ method, amount: parsedAmount, address: normalizedAddress, network: normalizedNetwork }), timestamp);

      return {
        withdrawalId: withdrawalResult.lastInsertRowid,
        status: 'pending_review',
        amount: parsedAmount,
        method,
      };
    });

    const withdrawal = createWithdrawal();
    return res.status(201).json({ ...withdrawal, message: 'Withdrawal request submitted for review' });
  } catch (error) {
    if (error?.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: error.message });
    }

    console.error('Withdrawal error:', error);
    return res.status(500).json({ error: 'Failed to initiate withdrawal' });
  }
});

// Get withdrawal status
router.get('/:withdrawalId', (req, res) => {
  const { withdrawalId } = req.params;
  const userId = req.user.userId;

  try {
    const withdrawal = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ? AND type = ?')
      .get(withdrawalId, userId, 'withdrawal');

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    return res.json({
      ...withdrawal,
      amount: Number(withdrawal.amount),
      fee: Number(withdrawal.fee || 0),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch withdrawal' });
  }
});

export default router;

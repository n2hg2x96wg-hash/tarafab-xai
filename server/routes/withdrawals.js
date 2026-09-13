import express from 'express';

const router = express.Router();

// Initiate withdrawal
router.post('/initiate', (req, res) => {
  const { method, amount, address, network } = req.body;
  const userId = req.user.userId;
  const parsedAmount = Number(amount);

  if (!method || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !address) {
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
        .run(
          userId,
          'withdrawal',
          method,
          parsedAmount,
          address,
          network || 'mainnet',
          'pending_review',
          timestamp
        );

      const newAvailable = Number(account.availableBalance) - parsedAmount;
      const newPending = Number(account.pendingBalance) + parsedAmount;

      global.db
        .prepare('UPDATE accounts SET availableBalance = ?, pendingBalance = ?, updatedAt = ? WHERE userId = ?')
        .run(newAvailable, newPending, timestamp, userId);

      global.db
        .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
        .run(
          userId,
          'withdrawal_initiated',
          JSON.stringify({ method, amount: parsedAmount, address, network: network || 'mainnet' }),
          timestamp
        );

      return {
        withdrawalId: withdrawalResult.lastInsertRowid,
        status: 'pending_review',
        amount: parsedAmount,
        method,
      };
    });

    const withdrawal = createWithdrawal();

    res.status(201).json({
      ...withdrawal,
      message: 'Withdrawal request submitted for review',
    });
  } catch (error) {
    if (error?.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: error.message });
    }

    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Failed to initiate withdrawal' });
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

    res.json({
      ...withdrawal,
      amount: parseFloat(withdrawal.amount),
      fee: parseFloat(withdrawal.fee),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch withdrawal' });
  }
});

export default router;

import express from 'express';

const router = express.Router();

// Initiate withdrawal
router.post('/initiate', (req, res) => {
  const { method, amount, address, network } = req.body;
  const userId = req.user.userId;

  if (!method || !amount || parseFloat(amount) <= 0 || !address) {
    return res.status(400).json({ error: 'Invalid withdrawal parameters' });
  }

  try {
    // Get user account
    const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);

    if (!account || parseFloat(account.availableBalance) < parseFloat(amount)) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    // Create withdrawal transaction
    const result = global.db
      .prepare(
        'INSERT INTO transactions (userId, type, method, amount, address, network, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        userId,
        'withdrawal',
        method,
        amount,
        address,
        network || 'mainnet',
        'pending_review',
        new Date().toISOString()
      );

    // Deduct from available balance (reserved)
    const newAvailable = parseFloat(account.availableBalance) - parseFloat(amount);
    const newPending = parseFloat(account.pendingBalance) + parseFloat(amount);

    global.db
      .prepare('UPDATE accounts SET availableBalance = ?, pendingBalance = ? WHERE userId = ?')
      .run(newAvailable, newPending, userId);

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        userId,
        'withdrawal_initiated',
        JSON.stringify({ method, amount, address, network }),
        new Date().toISOString()
      );

    res.status(201).json({
      withdrawalId: result.lastInsertRowid,
      status: 'pending_review',
      amount: parseFloat(amount),
      method,
      message: 'Withdrawal request submitted for review',
    });
  } catch (error) {
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

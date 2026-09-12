import express from 'express';
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

// Admin middleware
router.use(verifyAdmin);

// Get all users
router.get('/users', (req, res) => {
  try {
    const users = global.db
      .prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users')
      .all();

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details
router.get('/users/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    const user = global.db
      .prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users WHERE id = ?')
      .get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);
    const transactions = global.db
      .prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC')
      .all(userId);

    res.json({
      user,
      account: account ? {
        ...account,
        accountBalance: parseFloat(account.accountBalance),
        availableBalance: parseFloat(account.availableBalance),
        investedBalance: parseFloat(account.investedBalance),
        pendingBalance: parseFloat(account.pendingBalance),
      } : null,
      transactionCount: transactions.length,
      totalTransacted: transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update transaction status (approve/reject/complete)
router.post('/transactions/:transactionId/approve', (req, res) => {
  const { transactionId } = req.params;

  try {
    const transaction = global.db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'completed') {
      return res.status(400).json({ error: 'Transaction already completed' });
    }

    // Update transaction status
    global.db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run('completed', transactionId);

    // Handle balance updates based on transaction type
    if (transaction.type === 'deposit') {
      const account = global.db
        .prepare('SELECT * FROM accounts WHERE userId = ?')
        .get(transaction.userId);
      const newBalance = parseFloat(account.accountBalance) + parseFloat(transaction.amount);
      const newAvailable = parseFloat(account.availableBalance) + parseFloat(transaction.amount);

      global.db
        .prepare('UPDATE accounts SET accountBalance = ?, availableBalance = ? WHERE userId = ?')
        .run(newBalance, newAvailable, transaction.userId);
    }

    // Log admin action
    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        req.user.userId,
        'transaction_approved',
        JSON.stringify({ transactionId, originalStatus: transaction.status }),
        new Date().toISOString()
      );

    res.json({ message: 'Transaction approved', status: 'completed' });
  } catch (error) {
    console.error('Admin approval error:', error);
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
});

// Reject transaction
router.post('/transactions/:transactionId/reject', (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;

  try {
    const transaction = global.db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction
    global.db
      .prepare('UPDATE transactions SET status = ?, notes = ? WHERE id = ?')
      .run('rejected', reason || '', transactionId);

    // Refund if withdrawal
    if (transaction.type === 'withdrawal') {
      const account = global.db
        .prepare('SELECT * FROM accounts WHERE userId = ?')
        .get(transaction.userId);
      const newAvailable = parseFloat(account.availableBalance) + parseFloat(transaction.amount);
      const newPending = parseFloat(account.pendingBalance) - parseFloat(transaction.amount);

      global.db
        .prepare('UPDATE accounts SET availableBalance = ?, pendingBalance = ? WHERE userId = ?')
        .run(newAvailable, newPending, transaction.userId);
    }

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        req.user.userId,
        'transaction_rejected',
        JSON.stringify({ transactionId, reason }),
        new Date().toISOString()
      );

    res.json({ message: 'Transaction rejected', status: 'rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject transaction' });
  }
});

// Get audit logs
router.get('/audit-logs', (req, res) => {
  try {
    const logs = global.db
      .prepare('SELECT * FROM auditLogs ORDER BY timestamp DESC LIMIT 100')
      .all();

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get platform statistics
router.get('/stats', (req, res) => {
  try {
    const totalUsers = global.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalDeposits = global.db
      .prepare('SELECT SUM(amount) as total FROM transactions WHERE type = ? AND status = ?')
      .get('deposit', 'completed')?.total || 0;
    const totalWithdrawals = global.db
      .prepare('SELECT SUM(amount) as total FROM transactions WHERE type = ? AND status = ?')
      .get('withdrawal', 'completed')?.total || 0;
    const pendingTransactions = global.db
      .prepare('SELECT COUNT(*) as count FROM transactions WHERE status LIKE ?')
      .get('pending%').count;

    res.json({
      totalUsers,
      totalDeposits: parseFloat(totalDeposits) || 0,
      totalWithdrawals: parseFloat(totalWithdrawals) || 0,
      pendingTransactions,
      platformBalance: (parseFloat(totalDeposits) || 0) - (parseFloat(totalWithdrawals) || 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;

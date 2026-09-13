import express from 'express';
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();
const REVIEWABLE_STATUSES = new Set(['pending', 'pending_verification', 'pending_review']);

router.use(verifyAdmin);

router.get('/users', (req, res) => {
  try {
    const users = global.db.prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users ORDER BY createdAt DESC').all();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const user = global.db.prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);
    const transactions = global.db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC').all(userId);

    res.json({
      user,
      account: account ? {
        ...account,
        accountBalance: Number(account.accountBalance),
        availableBalance: Number(account.availableBalance),
        investedBalance: Number(account.investedBalance),
        pendingBalance: Number(account.pendingBalance),
      } : null,
      transactionCount: transactions.length,
      totalTransacted: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.patch('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const { fullName, emailVerified } = req.body;

  try {
    const existing = global.db.prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const nextName = typeof fullName === 'string' ? fullName.trim() : existing.fullName;
    if (!nextName || nextName.length > 120) return res.status(400).json({ error: 'Full name must be between 1 and 120 characters' });

    const nextVerified = typeof emailVerified === 'boolean' ? (emailVerified ? 1 : 0) : existing.emailVerified;

    global.db.transaction(() => {
      global.db.prepare('UPDATE users SET fullName = ?, emailVerified = ?, updatedAt = ? WHERE id = ?').run(nextName, nextVerified, new Date().toISOString(), userId);
      global.db.prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)').run(
        req.user.userId, 'admin_user_updated', JSON.stringify({ targetUserId: userId, changed: {
          fullName: nextName !== existing.fullName,
          emailVerified: nextVerified !== existing.emailVerified,
        }}), new Date().toISOString()
      );
    })();

    const updated = global.db.prepare('SELECT id, fullName, email, role, emailVerified, createdAt FROM users WHERE id = ?').get(userId);
    res.json({ user: updated });
  } catch (error) {
    console.error('Admin user update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/transactions/:transactionId/approve', (req, res) => {
  const { transactionId } = req.params;

  try {
    const result = global.db.transaction(() => {
      const transaction = global.db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
      if (!transaction) return { error: 'Transaction not found', status: 404 };
      if (!REVIEWABLE_STATUSES.has(transaction.status)) return { error: 'Transaction is not reviewable in its current state', status: 409 };

      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'Invalid transaction amount', status: 400 };

      const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(transaction.userId);
      if (!account) return { error: 'Account not found', status: 404 };

      if (transaction.type === 'deposit') {
        global.db.prepare('UPDATE accounts SET accountBalance = accountBalance + ?, availableBalance = availableBalance + ?, updatedAt = ? WHERE userId = ?')
          .run(amount, amount, new Date().toISOString(), transaction.userId);
      }

      if (transaction.type === 'withdrawal') {
        const pending = Number(account.pendingBalance);
        if (!Number.isFinite(pending) || pending < amount) return { error: 'Insufficient reserved withdrawal balance', status: 409 };
        global.db.prepare('UPDATE accounts SET pendingBalance = pendingBalance - ?, updatedAt = ? WHERE userId = ?')
          .run(amount, new Date().toISOString(), transaction.userId);
      }

      const updated = global.db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ? AND status IN ('pending', 'pending_verification', 'pending_review')").run(transactionId);
      if (updated.changes !== 1) return { error: 'Transaction changed before approval; please refresh and retry', status: 409 };

      global.db.prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)').run(
        req.user.userId, 'transaction_approved', JSON.stringify({ transactionId, originalStatus: transaction.status, type: transaction.type, amount }), new Date().toISOString()
      );
      return { message: 'Transaction approved', status: 'completed' };
    })();

    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    console.error('Admin approval error:', error);
    return res.status(500).json({ error: 'Failed to approve transaction' });
  }
});

router.post('/transactions/:transactionId/reject', (req, res) => {
  const { transactionId } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length > 500) return res.status(400).json({ error: 'Rejection reason must be 500 characters or fewer' });

  try {
    const result = global.db.transaction(() => {
      const transaction = global.db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
      if (!transaction) return { error: 'Transaction not found', status: 404 };
      if (!REVIEWABLE_STATUSES.has(transaction.status)) return { error: 'Transaction is not reviewable in its current state', status: 409 };

      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'Invalid transaction amount', status: 400 };

      if (transaction.type === 'withdrawal') {
        const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(transaction.userId);
        if (!account) return { error: 'Account not found', status: 404 };
        const pending = Number(account.pendingBalance);
        if (!Number.isFinite(pending) || pending < amount) return { error: 'Reserved withdrawal balance is inconsistent', status: 409 };
        global.db.prepare('UPDATE accounts SET availableBalance = availableBalance + ?, pendingBalance = pendingBalance - ?, updatedAt = ? WHERE userId = ?')
          .run(amount, amount, new Date().toISOString(), transaction.userId);
      }

      const updated = global.db.prepare("UPDATE transactions SET status = 'rejected', notes = ? WHERE id = ? AND status IN ('pending', 'pending_verification', 'pending_review')").run(reason, transactionId);
      if (updated.changes !== 1) return { error: 'Transaction changed before rejection; please refresh and retry', status: 409 };

      global.db.prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)').run(
        req.user.userId, 'transaction_rejected', JSON.stringify({ transactionId, originalStatus: transaction.status, type: transaction.type, amount, reason }), new Date().toISOString()
      );
      return { message: 'Transaction rejected', status: 'rejected' };
    })();

    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    console.error('Admin rejection error:', error);
    return res.status(500).json({ error: 'Failed to reject transaction' });
  }
});

// Audited account adjustment. This is an accounting entry, not a hidden display-only balance setter.
router.post('/users/:userId/account-adjustments', (req, res) => {
  const { userId } = req.params;
  const amount = Number(req.body?.amount);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Adjustment amount must be a non-zero number' });
  if (Math.abs(amount) > 100000000) return res.status(400).json({ error: 'Adjustment amount is outside the allowed range' });
  if (!reason || reason.length > 500) return res.status(400).json({ error: 'A reason of 1 to 500 characters is required' });

  try {
    const result = global.db.transaction(() => {
      const user = global.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) return { error: 'User not found', status: 404 };
      const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);
      if (!account) return { error: 'Account not found', status: 404 };

      const currentBalance = Number(account.accountBalance);
      const currentAvailable = Number(account.availableBalance);
      const nextBalance = currentBalance + amount;
      const nextAvailable = currentAvailable + amount;
      if (nextBalance < 0 || nextAvailable < 0) return { error: 'Adjustment would create a negative balance', status: 409 };

      const timestamp = new Date().toISOString();
      const reference = `ADJ-${Date.now()}-${userId}`;
      const tx = global.db.prepare('INSERT INTO transactions (userId, type, method, amount, fee, asset, reference, status, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, 'return', 'admin_adjustment', amount, 0, 'USD', reference, 'completed', reason, timestamp);

      global.db.prepare('UPDATE accounts SET accountBalance = ?, availableBalance = ?, updatedAt = ? WHERE userId = ?')
        .run(nextBalance, nextAvailable, timestamp, userId);

      global.db.prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)').run(
        req.user.userId, 'admin_account_adjustment', JSON.stringify({ targetUserId: Number(userId), transactionId: tx.lastInsertRowid, amount, reason, previousBalance: currentBalance, newBalance: nextBalance }), timestamp
      );

      return { transactionId: tx.lastInsertRowid, accountBalance: nextBalance, availableBalance: nextAvailable };
    })();

    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Admin account adjustment error:', error);
    return res.status(500).json({ error: 'Failed to apply account adjustment' });
  }
});

router.get('/audit-logs', (req, res) => {
  try {
    const logs = global.db.prepare('SELECT * FROM auditLogs ORDER BY timestamp DESC LIMIT 100').all();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const totalUsers = global.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalDeposits = global.db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'deposit' AND status = 'completed'").get().total;
    const totalWithdrawals = global.db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'withdrawal' AND status = 'completed'").get().total;
    const pendingTransactions = global.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status IN ('pending', 'pending_verification', 'pending_review')").get().count;

    res.json({
      totalUsers,
      totalDeposits: Number(totalDeposits) || 0,
      totalWithdrawals: Number(totalWithdrawals) || 0,
      pendingTransactions,
      platformBalance: (Number(totalDeposits) || 0) - (Number(totalWithdrawals) || 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;

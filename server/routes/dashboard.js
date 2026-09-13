import express from 'express';

const router = express.Router();

router.get('/data', (req, res) => {
  try {
    const userId = req.user.userId;
    const account = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);

    if (!account) return res.status(404).json({ error: 'Account not found' });

    const recentTransactions = global.db
      .prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT 10')
      .all(userId);

    res.json({
      account: {
        accountBalance: Number(account.accountBalance),
        availableBalance: Number(account.availableBalance),
        investedBalance: Number(account.investedBalance),
        pendingBalance: Number(account.pendingBalance),
      },
      performance: null,
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        fee: Number(t.fee),
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;

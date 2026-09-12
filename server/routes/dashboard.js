import express from 'express';

const router = express.Router();

// Get user dashboard data
router.get('/data', (req, res) => {
  try {
    const userId = req.user.userId;

    // Get account balances
    const account = global.db
      .prepare('SELECT * FROM accounts WHERE userId = ?')
      .get(userId);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get recent transactions
    const recentTransactions = global.db
      .prepare(
        'SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT 10'
      )
      .all(userId);

    // Calculate performance (mock for now - real implementation would use historical data)
    const totalProfit = recentTransactions
      .filter((t) => t.type === 'return')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    res.json({
      account: {
        accountBalance: parseFloat(account.accountBalance),
        availableBalance: parseFloat(account.availableBalance),
        investedBalance: parseFloat(account.investedBalance),
        pendingBalance: parseFloat(account.pendingBalance),
      },
      performance: {
        totalProfit,
        profitPercentage: ((totalProfit / Math.max(parseFloat(account.accountBalance), 1)) * 100).toFixed(2),
      },
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
        fee: parseFloat(t.fee),
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;

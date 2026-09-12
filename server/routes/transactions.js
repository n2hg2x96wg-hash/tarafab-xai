import express from 'express';

const router = express.Router();

// Get user transactions
router.get('/', (req, res) => {
  const userId = req.user.userId;
  const { type, status, limit = 50, offset = 0 } = req.query;

  try {
    let query = 'SELECT * FROM transactions WHERE userId = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = global.db.prepare(query).all(...params);

    const countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE userId = ?' +
      (type ? ' AND type = ?' : '') +
      (status ? ' AND status = ?' : '');
    const countParams = [userId];
    if (type) countParams.push(type);
    if (status) countParams.push(status);
    const total = global.db.prepare(countQuery).get(...countParams).count;

    res.json({
      transactions: transactions.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
        fee: parseFloat(t.fee || 0),
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transaction details
router.get('/:transactionId', (req, res) => {
  const { transactionId } = req.params;
  const userId = req.user.userId;

  try {
    const transaction = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ?')
      .get(transactionId, userId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      ...transaction,
      amount: parseFloat(transaction.amount),
      fee: parseFloat(transaction.fee || 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

export default router;

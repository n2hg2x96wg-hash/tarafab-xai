import express from 'express';

const router = express.Router();
const MAX_PAGE_SIZE = 100;
const ALLOWED_TYPES = new Set(['deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'investment', 'fee', 'return']);
const ALLOWED_STATUSES = new Set(['pending', 'pending_review', 'pending_verification', 'pending_blockchain_confirmation', 'confirmed', 'completed', 'failed', 'rejected', 'cancelled']);

function parsePageValue(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

// Get only the authenticated user's transactions.
router.get('/', (req, res) => {
  const userId = req.user.userId;
  const { type, status } = req.query;
  const limit = parsePageValue(req.query.limit, 50, MAX_PAGE_SIZE);
  const offset = parsePageValue(req.query.offset, 0, Number.MAX_SAFE_INTEGER);

  if (type && !ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: 'Unsupported transaction type' });
  }

  if (status && !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Unsupported transaction status' });
  }

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

    query += ' ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = global.db.prepare(query).all(...params);

    const countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE userId = ?' +
      (type ? ' AND type = ?' : '') +
      (status ? ' AND status = ?' : '');
    const countParams = [userId];
    if (type) countParams.push(type);
    if (status) countParams.push(status);
    const total = global.db.prepare(countQuery).get(...countParams).count;

    return res.json({
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
        fee: Number(transaction.fee || 0),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Transactions error:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transaction details for the authenticated user only.
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

    return res.json({
      ...transaction,
      amount: Number(transaction.amount),
      fee: Number(transaction.fee || 0),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

export default router;

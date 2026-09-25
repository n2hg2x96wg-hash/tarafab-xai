import express from 'express';

const router = express.Router();
const SUPPORTED_METHODS = new Set(['bitcoin', 'bank_transfer', 'card']);

function parsePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Initiate deposit
router.post('/initiate', (req, res) => {
  const { method, amount: rawAmount, asset } = req.body;
  const userId = req.user.userId;
  const amount = parsePositiveAmount(rawAmount);

  if (!SUPPORTED_METHODS.has(method) || amount === null) {
    return res.status(400).json({ error: 'Invalid deposit parameters' });
  }

  if (method === 'bitcoin' && !process.env.BTC_RECEIVING_ADDRESS) {
    return res.status(400).json({
      error: 'Bitcoin deposits not configured',
      message: 'Please configure BTC_RECEIVING_ADDRESS in environment variables',
    });
  }

  if (method === 'card' && process.env.PAYMENT_PROVIDER_ENABLED !== 'true') {
    return res.status(400).json({
      error: 'Card payments not configured',
      message: 'Please configure a supported payment provider before accepting card payments',
    });
  }

  try {
    const now = new Date().toISOString();
    const result = global.db
      .prepare(
        'INSERT INTO transactions (userId, type, method, amount, asset, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(userId, 'deposit', method, amount, asset || (method === 'bitcoin' ? 'BTC' : 'USD'), 'pending_verification', now);

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(userId, 'deposit_initiated', JSON.stringify({ method, amount, asset }), now);

    const depositId = result.lastInsertRowid;
    let depositDetails;

    if (method === 'bitcoin') {
      depositDetails = {
        address: process.env.BTC_RECEIVING_ADDRESS,
        network: process.env.BTC_NETWORK || 'mainnet',
        amount,
        asset: 'BTC',
        depositId,
        status: 'awaiting_payment',
      };
    } else if (method === 'bank_transfer') {
      depositDetails = {
        depositId,
        method,
        amount,
        status: 'awaiting_payment',
        message: 'Bank transfer instructions will be provided by the configured payment workflow',
      };
    } else {
      depositDetails = {
        depositId,
        method,
        amount,
        status: 'awaiting_payment',
        message: 'Continue through the configured payment provider',
      };
    }

    return res.status(201).json(depositDetails);
  } catch (error) {
    console.error('Deposit error:', error);
    return res.status(500).json({ error: 'Failed to initiate deposit' });
  }
});

// Submit a transaction hash for later blockchain confirmation.
// This endpoint records the hash; it does not claim that the transaction is verified.
router.post('/verify-transaction', (req, res) => {
  const { depositId, transactionHash } = req.body;
  const userId = req.user.userId;
  const normalizedHash = typeof transactionHash === 'string' ? transactionHash.trim() : '';

  if (!Number.isInteger(Number(depositId)) || !normalizedHash || normalizedHash.length > 256) {
    return res.status(400).json({ error: 'A valid deposit ID and transaction hash are required' });
  }

  try {
    const deposit = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ? AND type = ?')
      .get(Number(depositId), userId, 'deposit');

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    if (!['pending_verification', 'pending_blockchain_confirmation', 'awaiting_payment'].includes(deposit.status)) {
      return res.status(409).json({ error: 'This deposit is no longer awaiting transaction submission' });
    }

    const now = new Date().toISOString();
    global.db
      .prepare('UPDATE transactions SET status = ?, reference = ? WHERE id = ? AND userId = ?')
      .run('pending_blockchain_confirmation', normalizedHash, Number(depositId), userId);

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(userId, 'deposit_hash_submitted', JSON.stringify({ depositId: Number(depositId), transactionHash: normalizedHash }), now);

    return res.json({
      message: 'Transaction hash received and queued for blockchain confirmation',
      status: 'pending_blockchain_confirmation',
      transactionHash: normalizedHash,
    });
  } catch (error) {
    console.error('Transaction submission error:', error);
    return res.status(500).json({ error: 'Failed to submit transaction hash' });
  }
});

// Get deposit status
router.get('/:depositId', (req, res) => {
  const { depositId } = req.params;
  const userId = req.user.userId;

  try {
    const deposit = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ? AND type = ?')
      .get(depositId, userId, 'deposit');

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    return res.json({
      ...deposit,
      amount: Number(deposit.amount),
      fee: Number(deposit.fee || 0),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch deposit' });
  }
});

export default router;

import express from 'express';

const router = express.Router();

// Initiate deposit
router.post('/initiate', (req, res) => {
  const { method, amount, asset } = req.body;
  const userId = req.user.userId;

  if (!method || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid deposit parameters' });
  }

  try {
    // Create deposit transaction (pending verification)
    const result = global.db
      .prepare(
        'INSERT INTO transactions (userId, type, method, amount, asset, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(userId, 'deposit', method, amount, asset || 'USD', 'pending_verification', new Date().toISOString());

    // Log audit
    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        userId,
        'deposit_initiated',
        JSON.stringify({ method, amount, asset }),
        new Date().toISOString()
      );

    // Return deposit details based on method
    let depositDetails = {};

    if (method === 'bitcoin') {
      if (!process.env.BTC_RECEIVING_ADDRESS) {
        return res.status(400).json({
          error: 'Bitcoin deposits not configured',
          message: 'Please configure BTC_RECEIVING_ADDRESS in environment variables',
        });
      }

      depositDetails = {
        address: process.env.BTC_RECEIVING_ADDRESS,
        network: process.env.BTC_NETWORK || 'mainnet',
        amount: parseFloat(amount),
        asset: 'BTC',
        depositId: result.lastInsertRowid,
        status: 'awaiting_payment',
      };
    } else if (method === 'bank_transfer') {
      depositDetails = {
        depositId: result.lastInsertRowid,
        method: 'bank_transfer',
        amount: parseFloat(amount),
        status: 'awaiting_payment',
        message: 'Bank transfer details will be sent via email',
      };
    } else if (method === 'card') {
      if (!process.env.PAYMENT_PROVIDER_ENABLED) {
        return res.status(400).json({
          error: 'Card payments not configured',
          message: 'Please configure payment provider in environment variables',
        });
      }

      depositDetails = {
        depositId: result.lastInsertRowid,
        method: 'card',
        amount: parseFloat(amount),
        status: 'awaiting_payment',
        redirectUrl: '/mock-payment-processor', // Would redirect to real Stripe/payment processor
      };
    }

    res.status(201).json(depositDetails);
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Failed to initiate deposit' });
  }
});

// Submit transaction hash (for crypto deposits)
router.post('/verify-transaction', (req, res) => {
  const { depositId, transactionHash } = req.body;
  const userId = req.user.userId;

  if (!depositId || !transactionHash) {
    return res.status(400).json({ error: 'Deposit ID and transaction hash required' });
  }

  try {
    const deposit = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ?')
      .get(depositId, userId);

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // In production, verify with blockchain API
    // For now, mark as pending blockchain confirmation
    global.db
      .prepare('UPDATE transactions SET status = ?, reference = ? WHERE id = ?')
      .run('pending_blockchain_confirmation', transactionHash, depositId);

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        userId,
        'deposit_hash_submitted',
        JSON.stringify({ depositId, transactionHash }),
        new Date().toISOString()
      );

    res.json({
      message: 'Transaction hash received, awaiting blockchain confirmation',
      status: 'pending_blockchain_confirmation',
      transactionHash,
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Failed to verify transaction' });
  }
});

// Get deposit status
router.get('/:depositId', (req, res) => {
  const { depositId } = req.params;
  const userId = req.user.userId;

  try {
    const deposit = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ?')
      .get(depositId, userId);

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    res.json({
      ...deposit,
      amount: parseFloat(deposit.amount),
      fee: parseFloat(deposit.fee),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deposit' });
  }
});

export default router;

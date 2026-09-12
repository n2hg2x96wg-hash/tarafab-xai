import express from 'express';

const router = express.Router();

// Initiate transfer
router.post('/initiate', (req, res) => {
  const { recipientEmail, amount } = req.body;
  const userId = req.user.userId;

  if (!recipientEmail || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid transfer parameters' });
  }

  try {
    // Find recipient
    const recipient = global.db.prepare('SELECT * FROM users WHERE email = ?').get(recipientEmail);

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    if (recipient.id === userId) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // Get sender account
    const senderAccount = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);

    if (parseFloat(senderAccount.availableBalance) < parseFloat(amount)) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    // Create transfer transaction
    const result = global.db
      .prepare(
        'INSERT INTO transactions (userId, type, amount, recipientId, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(userId, 'transfer_out', amount, recipient.id, 'pending_review', new Date().toISOString());

    // Deduct from sender
    global.db
      .prepare('UPDATE accounts SET availableBalance = availableBalance - ? WHERE userId = ?')
      .run(amount, userId);

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(
        userId,
        'transfer_initiated',
        JSON.stringify({ recipientEmail, amount }),
        new Date().toISOString()
      );

    res.status(201).json({
      transferId: result.lastInsertRowid,
      status: 'pending_review',
      amount: parseFloat(amount),
      message: 'Transfer initiated and pending review',
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

// Get transfer status
router.get('/:transferId', (req, res) => {
  const { transferId } = req.params;
  const userId = req.user.userId;

  try {
    const transfer = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND (userId = ? OR recipientId = ?)')
      .get(transferId, userId, userId);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json({
      ...transfer,
      amount: parseFloat(transfer.amount),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

export default router;

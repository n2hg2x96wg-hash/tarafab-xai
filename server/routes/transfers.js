import express from 'express';

const router = express.Router();

// Initiate transfer
router.post('/initiate', (req, res) => {
  const { recipientEmail, amount } = req.body;
  const userId = req.user.userId;
  const normalizedEmail = typeof recipientEmail === 'string' ? recipientEmail.trim().toLowerCase() : '';
  const parsedAmount = Number(amount);

  if (!normalizedEmail || normalizedEmail.length > 254 || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer parameters' });
  }

  try {
    const createTransfer = global.db.transaction(() => {
      const recipient = global.db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail);

      if (!recipient) {
        const error = new Error('Recipient not found');
        error.code = 'RECIPIENT_NOT_FOUND';
        throw error;
      }

      if (recipient.id === userId) {
        const error = new Error('Cannot transfer to yourself');
        error.code = 'SELF_TRANSFER';
        throw error;
      }

      const senderAccount = global.db.prepare('SELECT * FROM accounts WHERE userId = ?').get(userId);
      if (!senderAccount || Number(senderAccount.availableBalance) < parsedAmount) {
        const error = new Error('Insufficient available balance');
        error.code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      const timestamp = new Date().toISOString();
      const result = global.db
        .prepare('INSERT INTO transactions (userId, type, amount, recipientId, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, 'transfer_out', parsedAmount, recipient.id, 'pending_review', timestamp);

      global.db
        .prepare('UPDATE accounts SET availableBalance = availableBalance - ?, pendingBalance = pendingBalance + ?, updatedAt = ? WHERE userId = ?')
        .run(parsedAmount, parsedAmount, timestamp, userId);

      global.db
        .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
        .run(userId, 'transfer_initiated', JSON.stringify({ recipientEmail: normalizedEmail, amount: parsedAmount }), timestamp);

      return { transferId: result.lastInsertRowid, status: 'pending_review', amount: parsedAmount };
    });

    return res.status(201).json({ ...createTransfer(), message: 'Transfer initiated and pending review' });
  } catch (error) {
    if (['RECIPIENT_NOT_FOUND', 'SELF_TRANSFER', 'INSUFFICIENT_BALANCE'].includes(error?.code)) {
      return res.status(error.code === 'RECIPIENT_NOT_FOUND' ? 404 : 400).json({ error: error.message });
    }

    console.error('Transfer error:', error);
    return res.status(500).json({ error: 'Failed to initiate transfer' });
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

    return res.json({ ...transfer, amount: Number(transfer.amount) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

export default router;

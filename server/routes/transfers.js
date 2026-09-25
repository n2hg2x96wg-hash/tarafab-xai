import express from 'express';

const router = express.Router();
const MAX_TRANSFER_AMOUNT = 1_000_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TRANSFER_AMOUNT) return null;
  if (Math.round(amount * 100) !== amount * 100) return null;
  return amount;
}

// Initiate transfer. Funds are reserved and remain pending until an authorized
// backend workflow completes the transfer; the client cannot approve settlement.
router.post('/initiate', (req, res) => {
  const { recipientEmail, amount } = req.body;
  const userId = req.user.userId;
  const normalizedEmail = typeof recipientEmail === 'string' ? recipientEmail.trim().toLowerCase() : '';
  const parsedAmount = parsePositiveAmount(amount);

  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254 || parsedAmount === null) {
    return res.status(400).json({ error: 'Enter a valid recipient email and amount' });
  }

  try {
    const createTransfer = global.db.transaction(() => {
      const recipient = global.db
        .prepare('SELECT id, email, emailVerified, role FROM users WHERE lower(email) = ?')
        .get(normalizedEmail);

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

      if (!recipient.emailVerified) {
        const error = new Error('Recipient email is not verified');
        error.code = 'RECIPIENT_NOT_VERIFIED';
        throw error;
      }

      const recipientAccount = global.db.prepare('SELECT userId FROM accounts WHERE userId = ?').get(recipient.id);
      if (!recipientAccount) {
        const error = new Error('Recipient account is not ready to receive transfers');
        error.code = 'RECIPIENT_ACCOUNT_UNAVAILABLE';
        throw error;
      }

      const senderAccount = global.db
        .prepare('SELECT availableBalance FROM accounts WHERE userId = ?')
        .get(userId);

      if (!senderAccount || Number(senderAccount.availableBalance) < parsedAmount) {
        const error = new Error('Insufficient available balance');
        error.code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      const timestamp = new Date().toISOString();
      const result = global.db
        .prepare('INSERT INTO transactions (userId, type, amount, recipientId, status, timestamp, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, 'transfer_out', parsedAmount, recipient.id, 'pending_review', timestamp, 'Awaiting authorized settlement review');

      global.db
        .prepare('UPDATE accounts SET availableBalance = availableBalance - ?, pendingBalance = pendingBalance + ?, updatedAt = ? WHERE userId = ?')
        .run(parsedAmount, parsedAmount, timestamp, userId);

      global.db
        .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
        .run(userId, 'transfer_initiated', JSON.stringify({ recipientId: recipient.id, recipientEmail: normalizedEmail, amount: parsedAmount }), timestamp);

      return { transferId: result.lastInsertRowid, status: 'pending_review', amount: parsedAmount };
    });

    return res.status(201).json({ ...createTransfer(), message: 'Transfer request submitted for review' });
  } catch (error) {
    if (['RECIPIENT_NOT_FOUND', 'SELF_TRANSFER', 'RECIPIENT_NOT_VERIFIED', 'RECIPIENT_ACCOUNT_UNAVAILABLE', 'INSUFFICIENT_BALANCE'].includes(error?.code)) {
      const status = error.code === 'RECIPIENT_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }

    console.error('Transfer error:', error);
    return res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

// Get transfer status for the sender or recipient only.
router.get('/:transferId', (req, res) => {
  const { transferId } = req.params;
  const userId = req.user.userId;

  try {
    const transfer = global.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND type = ? AND (userId = ? OR recipientId = ?)')
      .get(transferId, 'transfer_out', userId, userId);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    return res.json({ ...transfer, amount: Number(transfer.amount) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

export default router;

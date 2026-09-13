import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';

const router = express.Router();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Register
router.post('/register', (req, res) => {
  const { fullName, email, password, confirmPassword, termsAccepted } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!fullName || !normalizedEmail || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (!termsAccepted) {
    return res.status(400).json({ error: 'Must accept terms and privacy policy' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existingUser = global.db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  try {
    const hashedPassword = bcryptjs.hashSync(password, 12);
    const now = new Date().toISOString();

    const createAccount = global.db.transaction(() => {
      const result = global.db
        .prepare(
          'INSERT INTO users (fullName, email, passwordHash, emailVerified, role, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)'
        )
        .run(String(fullName).trim(), normalizedEmail, hashedPassword, 'customer', now, now);

      global.db
        .prepare(
          'INSERT INTO accounts (userId, accountBalance, availableBalance, investedBalance, pendingBalance, createdAt, updatedAt) VALUES (?, 0, 0, 0, 0, ?, ?)'
        )
        .run(result.lastInsertRowid, now, now);

      return Number(result.lastInsertRowid);
    });

    const userId = createAccount();
    const verificationToken = jwt.sign(
      { userId, type: 'email-verification' },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // A real deployment should deliver this token through the configured email provider.
    // It is never returned outside development because doing so would weaken verification.
    res.status(201).json({
      message: 'Account created. Please verify your email before signing in.',
      userId,
      verificationToken: process.env.NODE_ENV === 'development' ? verificationToken : undefined,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { email, password, rememberMe } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = global.db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    if (!user || !bcryptjs.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before signing in', code: 'EMAIL_NOT_VERIFIED' });
    }

    const expiresIn = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      jwtSecret,
      { expiresIn }
    );

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(user.id, 'login', JSON.stringify({ rememberMe: Boolean(rememberMe) }), new Date().toISOString());

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify email token
router.post('/verify-email', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Verification token required' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    if (decoded.type !== 'email-verification' || !decoded.userId) {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const result = global.db
      .prepare('UPDATE users SET emailVerified = 1, updatedAt = ? WHERE id = ?')
      .run(new Date().toISOString(), decoded.userId);

    if (result.changes !== 1) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

// Request password reset
router.post('/forgot-password', (req, res) => {
  const normalizedEmail = normalizeEmail(req.body.email);

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const user = global.db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);

    // Always return the same response so account existence is not disclosed.
    if (!user) {
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // A production email provider must deliver this token. Never expose it in production.
    res.json({
      message: 'If the email exists, a password reset link has been sent',
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// Reset password
router.post('/reset-password', (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    if (decoded.type !== 'password-reset' || !decoded.userId) {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const hashedPassword = bcryptjs.hashSync(newPassword, 12);
    const result = global.db
      .prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
      .run(hashedPassword, new Date().toISOString(), decoded.userId);

    if (result.changes !== 1) {
      return res.status(400).json({ error: 'Account not found' });
    }

    global.db
      .prepare('INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(decoded.userId, 'password_reset', '{}', new Date().toISOString());

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

export default router;

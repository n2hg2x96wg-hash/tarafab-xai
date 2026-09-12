import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  const { fullName, email, password, confirmPassword, termsAccepted } = req.body;

  // Validation
  if (!fullName || !email || !password) {
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

  // Check if email already exists
  const existingUser = global.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  try {
    // Hash password
    const hashedPassword = bcryptjs.hashSync(password, 10);

    // Create user
    const result = global.db
      .prepare(
        'INSERT INTO users (fullName, email, passwordHash, emailVerified, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(fullName, email, hashedPassword, 1, 'customer', new Date().toISOString());

    // Create associated account
    global.db
      .prepare(
        'INSERT INTO accounts (userId, accountBalance, availableBalance, investedBalance, pendingBalance, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(result.lastInsertRowid, 0, 0, 0, 0, new Date().toISOString());

    // Create verification token (in real app, send via email)
    const verificationToken = jwt.sign(
      { userId: result.lastInsertRowid, type: 'email-verification' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      userId: result.lastInsertRowid,
      verificationToken, // In production, this would be sent via email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = global.db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordValid = bcryptjs.compareSync(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const expiresIn = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Log login audit
    global.db
      .prepare(
        'INSERT INTO auditLogs (userId, action, details, timestamp) VALUES (?, ?, ?, ?)'
      )
      .run(user.id, 'login', JSON.stringify({ email, rememberMe }), new Date().toISOString());

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'email-verification') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    global.db.prepare('UPDATE users SET emailVerified = 1 WHERE id = ?').run(decoded.userId);

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

// Request password reset
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const user = global.db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // In production, send resetToken via email
    // For now, return it (development only)
    res.json({
      message: 'Password reset token sent',
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (error) {
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const hashedPassword = bcryptjs.hashSync(newPassword, 10);
    global.db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashedPassword, decoded.userId);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

export default router;

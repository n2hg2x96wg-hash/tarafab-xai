import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.js';
import depositsRoutes from './routes/deposits.js';
import withdrawalsRoutes from './routes/withdrawals.js';
import transfersRoutes from './routes/transfers.js';
import transactionsRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import { verifyToken } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const dbPath = process.env.DATABASE_URL || join(__dirname, 'data', 'tarafab.db');
global.db = new Database(dbPath);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15 minutes for authenticated users
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (with rate limiting)
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (require authentication)
app.use('/api/deposits', apiLimiter, verifyToken, depositsRoutes);
app.use('/api/withdrawals', apiLimiter, verifyToken, withdrawalsRoutes);
app.use('/api/transfers', apiLimiter, verifyToken, transfersRoutes);
app.use('/api/transactions', apiLimiter, verifyToken, transactionsRoutes);
app.use('/api/dashboard', apiLimiter, verifyToken, dashboardRoutes);

// Admin routes (require admin role)
app.use('/api/admin', apiLimiter, verifyToken, adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Tarafab.XAi API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

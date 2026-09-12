import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'data');
const dbPath = join(dbDir, 'tarafab.db');

// Create data directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    emailVerified INTEGER DEFAULT 0,
    role TEXT DEFAULT 'customer',
    createdAt TEXT NOT NULL,
    updatedAt TEXT
  );

  -- Accounts table (one per user)
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER UNIQUE NOT NULL,
    accountBalance REAL DEFAULT 0,
    availableBalance REAL DEFAULT 0,
    investedBalance REAL DEFAULT 0,
    pendingBalance REAL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  -- Transactions table (immutable ledger)
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    type TEXT NOT NULL,
    method TEXT,
    amount REAL NOT NULL,
    fee REAL DEFAULT 0,
    asset TEXT DEFAULT 'USD',
    address TEXT,
    network TEXT,
    recipientId INTEGER,
    reference TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (recipientId) REFERENCES users(id)
  );

  -- Audit logs
  CREATE TABLE IF NOT EXISTS auditLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);
  CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
  CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_auditLogs_userId ON auditLogs(userId);
  CREATE INDEX IF NOT EXISTS idx_auditLogs_timestamp ON auditLogs(timestamp);
`);

console.log(`✅ Database initialized at: ${dbPath}`);
db.close();

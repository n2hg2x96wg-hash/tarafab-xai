# Tarafab.XAi — Professional Investment Platform

A production-grade fintech investment platform with real authentication, database ledger, and comprehensive financial operations.

## Quick Start

### Prerequisites
- Node.js >= 20
- npm

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Initialize database
cd server && npm run build-db && cd ..
```

### Configuration

1. Copy environment template:
```bash
cp server/.env.example server/.env
```

2. Update `server/.env` with your configuration:
```env
NODE_ENV=development
PORT=3001
JWT_SECRET=your_super_secret_jwt_key_change_in_production
FRONTEND_URL=http://localhost:5173

# Market Data (CoinGecko is free)
MARKET_DATA_ENABLED=true
MARKET_DATA_API=https://api.coingecko.com/api/v3

# Bitcoin Configuration (for real deposits)
BTC_RECEIVING_ADDRESS=your_bitcoin_address
BTC_NETWORK=mainnet
```

### Development

```bash
# Start frontend (Vite)
npm run dev

# In another terminal, start backend
cd server && npm run dev
```

The frontend runs on `http://localhost:5173` and backend on `http://localhost:3001`.

### Production Build

```bash
npm run build
```

This creates optimized production builds in `dist/`.

## Architecture

### Frontend
- **React 19** with TypeScript
- **Vite** for fast development and bundling
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Recharts** for financial charts
- **Axios** for API communication

### Backend
- **Express.js** server
- **SQLite** with better-sqlite3 for data persistence
- **JWT** for authentication
- **bcryptjs** for password hashing
- **Rate limiting** on auth endpoints

### Database Schema

**users**: User accounts with authentication
**accounts**: Customer account balances and holdings
**transactions**: Immutable ledger of all financial operations
**auditLogs**: Security and compliance audit trail

## Features

### Authentication
- ✅ Email/password registration with duplicate detection
- ✅ Secure login with session management
- ✅ Remember me (30-day sessions)
- ✅ Password reset flow
- ✅ Email verification
- ✅ JWT token-based auth

### Customer Dashboard
- ✅ Real-time balance display (from backend ledger)
- ✅ Account balance, available, invested, pending
- ✅ Portfolio performance chart
- ✅ Recent transaction history

### Deposits
- ✅ Bitcoin deposit support (mainnet/testnet)
- ✅ Bank transfer integration ready
- ✅ Credit card payment provider ready
- ✅ Transaction hash verification flow
- ✅ Blockchain confirmation tracking
- ✅ Pending verification state (no auto-credit without backend verification)

### Withdrawals
- ✅ Bitcoin wallet withdrawal
- ✅ Bank transfer withdrawal
- ✅ Withdrawal review workflow
- ✅ Balance reservation during review
- ✅ Audit logging

### Transfers
- ✅ Between Tarafab.XAi accounts
- ✅ Recipient email validation
- ✅ Instant transfer settlement
- ✅ Audit logging

### Transactions
- ✅ Searchable transaction history
- ✅ Filter by type and status
- ✅ Complete transaction details
- ✅ Immutable ledger recording

### Security
- ✅ Server-side password hashing (bcrypt)
- ✅ JWT token validation on all protected routes
- ✅ Rate limiting on auth endpoints (5 attempts per 15 min)
- ✅ API rate limiting (100 requests per 15 min)
- ✅ Audit logging for sensitive actions
- ✅ CORS configuration
- ✅ Environment-based secrets management

### Admin Panel (Stub)
- Routes in `/api/admin` for:
  - User management and verification
  - Transaction review and approval
  - Withdrawal and deposit processing
  - Platform statistics and audit logs

## API Routes

### Authentication
- `POST /api/auth/register` — Create new account
- `POST /api/auth/login` — Sign in
- `POST /api/auth/verify-email` — Verify email token
- `POST /api/auth/forgot-password` — Request password reset
- `POST /api/auth/reset-password` — Reset password with token

### Protected Routes (require valid JWT)

**Dashboard**
- `GET /api/dashboard/data` — Get account and performance data

**Deposits**
- `POST /api/deposits/initiate` — Start a deposit
- `POST /api/deposits/verify-transaction` — Submit blockchain hash for verification
- `GET /api/deposits/:depositId` — Get deposit status

**Withdrawals**
- `POST /api/withdrawals/initiate` — Request withdrawal
- `GET /api/withdrawals/:withdrawalId` — Get withdrawal status

**Transfers**
- `POST /api/transfers/initiate` — Send funds to another account
- `GET /api/transfers/:transferId` — Get transfer status

**Transactions**
- `GET /api/transactions` — List transactions (with filtering)
- `GET /api/transactions/:transactionId` — Get transaction details

**Admin** (admin role required)
- `GET /api/admin/users` — List all users
- `GET /api/admin/users/:userId` — Get user details
- `POST /api/admin/transactions/:transactionId/approve` — Approve transaction
- `POST /api/admin/transactions/:transactionId/reject` — Reject transaction
- `GET /api/admin/audit-logs` — View audit log
- `GET /api/admin/stats` — Platform statistics

## Deployment

### Vercel (Recommended)
The frontend builds automatically on Vercel.

For the backend, you have options:
1. Deploy server code to a Node.js host (Heroku, Railway, Render, etc.)
2. Convert to serverless functions (Vercel Functions, AWS Lambda)
3. Use a BaaS like Firebase Functions

### Environment Variables for Production
```env
NODE_ENV=production
JWT_SECRET=<generate_strong_random_string>
FRONTEND_URL=https://yourdomain.com

# Optional: Real integrations
MARKET_DATA_API=https://api.coingecko.com/api/v3
BTC_RECEIVING_ADDRESS=<your_bitcoin_address>
PAYMENT_PROVIDER_KEY=<stripe_key>
EMAIL_KEY=<sendgrid_key>
```

## Financial Compliance Notes

⚠️ **Before enabling real customer funds**, ensure:

1. **Regulatory Compliance**
   - Money transmitter licensing (varies by jurisdiction)
   - KYC/AML procedures implementation
   - Transaction reporting requirements

2. **Security Audits**
   - Penetration testing by third-party firm
   - Code security review
   - Compliance audit

3. **Insurance**
   - Fidelity insurance for employee theft
   - Errors & Omissions insurance
   - Cyber liability insurance

4. **Actual Integrations**
   - Real payment processor (Stripe, Adyen, etc.)
   - Real blockchain verification (Blockchair API, your own node)
   - Real email provider (SendGrid, Mailgun, etc.)
   - Production database (PostgreSQL with backups)

5. **Governance**
   - Terms of Service reviewed by legal counsel
   - Privacy Policy compliant with GDPR, CCPA, etc.
   - Clear disclosure of risks and limitations

## Market Data

The platform includes stubs for market data integration:

- **CoinGecko API** (free): Real Bitcoin prices, 24h change, volume
- **Environment toggle**: `MARKET_DATA_ENABLED=true/false`
- **Fallback behavior**: If disabled, shows "Market data unavailable" rather than fake prices

## Next Steps

1. **Configure Real Infrastructure**
   - Set up PostgreSQL database (SQLite is dev-only)
   - Configure payment provider account
   - Set up blockchain API access
   - Configure email provider

2. **Implement Missing Features** (per spec)
   - 2FA/TOTP setup
   - KYC verification workflow
   - Blockchain webhook listeners for deposit confirmation
   - Email notifications
   - Admin dashboard UI (routes exist, pages need building)

3. **Security Hardening**
   - Rate limiting tuning
   - CORS configuration for production domains
   - HTTPS enforcement
   - CSP headers
   - Regular security audits

4. **Testing**
   - Unit tests for critical paths
   - Integration tests for API flows
   - End-to-end tests for user journeys
   - Load testing for production readiness

## Support

For issues or questions, please contact: support@tarafab.com

## License

All rights reserved © 2026 Tarafab.XAi

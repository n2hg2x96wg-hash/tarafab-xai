export interface User {
  id: number | string;
  fullName: string;
  email: string;
  role: 'customer' | 'admin';
}

export interface Account {
  accountBalance: number;
  availableBalance: number;
  investedBalance: number;
  pendingBalance: number;
}

export interface Transaction {
  id: number | string;
  type: 'deposit' | 'withdrawal' | 'transfer_out' | 'transfer_in' | 'investment' | 'return' | 'adjustment';
  amount: number;
  fee: number;
  status: 'pending' | 'completed' | 'failed' | 'pending_verification' | 'pending_review' | 'pending_blockchain_confirmation' | 'rejected';
  timestamp: string;
  reference?: string;
  notes?: string;
}

export interface DashboardData {
  account: Account;
  performance: {
    totalProfit: number;
    profitPercentage: string;
  } | null;
  recentTransactions: Transaction[];
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: string;
}

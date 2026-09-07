// Transaction history, fully isolated per account.
export type TransactionType = 'Deposit' | 'Withdrawal' | 'Investment' | 'Return';
export type TransactionStatus = 'Completed' | 'Pending' | 'Failed';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  amount: number;
  status: TransactionStatus;
}

const transactionsByClient: Record<string, Transaction[]> = {
  // Jordan Ashworth — Conservative investor.
  'client-1': [
    { id: 'tx-c1-1001', date: '2026-08-27', type: 'Return', description: 'Steadfast Treasury Bonds interest', amount: 148.6, status: 'Completed' },
    { id: 'tx-c1-1002', date: '2026-08-20', type: 'Deposit', description: 'Bank transfer', amount: 2500, status: 'Completed' },
    { id: 'tx-c1-1003', date: '2026-08-11', type: 'Investment', description: 'Steady Income Plan allocation', amount: -1500, status: 'Completed' },
    { id: 'tx-c1-1004', date: '2026-07-29', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -400, status: 'Completed' },
    { id: 'tx-c1-1005', date: '2026-07-15', type: 'Return', description: 'Horizon Real Estate Trust distribution', amount: 62.4, status: 'Completed' },
    { id: 'tx-c1-1006', date: '2026-07-02', type: 'Deposit', description: 'Bank transfer', amount: 1800, status: 'Completed' },
  ],
  // Sarah Mitchell — Moderate investor.
  'client-2': [
    { id: 'tx-c2-1001', date: '2026-08-28', type: 'Return', description: 'Quantum Growth Fund payout', amount: 482.5, status: 'Completed' },
    { id: 'tx-c2-1002', date: '2026-08-25', type: 'Investment', description: 'Balanced Growth Plan allocation', amount: -2000, status: 'Completed' },
    { id: 'tx-c2-1003', date: '2026-08-22', type: 'Deposit', description: 'Bank transfer', amount: 5000, status: 'Completed' },
    { id: 'tx-c2-1004', date: '2026-08-19', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -1200, status: 'Pending' },
    { id: 'tx-c2-1005', date: '2026-08-14', type: 'Return', description: 'Steadfast Treasury Bonds interest', amount: 96.2, status: 'Completed' },
    { id: 'tx-c2-1006', date: '2026-08-10', type: 'Investment', description: 'Nova Crypto Basket allocation', amount: -750, status: 'Completed' },
    { id: 'tx-c2-1007', date: '2026-08-05', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -300, status: 'Failed' },
    { id: 'tx-c2-1008', date: '2026-07-30', type: 'Deposit', description: 'Card top-up', amount: 1500, status: 'Completed' },
    { id: 'tx-c2-1009', date: '2026-07-24', type: 'Return', description: 'Horizon Real Estate Trust distribution', amount: 210.0, status: 'Completed' },
    { id: 'tx-c2-1010', date: '2026-07-18', type: 'Investment', description: 'Frontier Innovation Fund allocation', amount: -3000, status: 'Completed' },
    { id: 'tx-c2-1011', date: '2026-07-12', type: 'Deposit', description: 'Bank transfer', amount: 2200, status: 'Completed' },
    { id: 'tx-c2-1012', date: '2026-07-06', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -450, status: 'Completed' },
  ],
  // Marcus Chen — Growth investor.
  'client-3': [
    { id: 'tx-c3-1001', date: '2026-08-29', type: 'Return', description: 'Nova Crypto Basket payout', amount: 1840.0, status: 'Completed' },
    { id: 'tx-c3-1002', date: '2026-08-26', type: 'Investment', description: 'Quantum Growth Fund allocation', amount: -8000, status: 'Completed' },
    { id: 'tx-c3-1003', date: '2026-08-21', type: 'Deposit', description: 'Bank transfer', amount: 12000, status: 'Completed' },
    { id: 'tx-c3-1004', date: '2026-08-16', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -2500, status: 'Pending' },
    { id: 'tx-c3-1005', date: '2026-08-09', type: 'Return', description: 'Helio Token Reserve staking reward', amount: 315.7, status: 'Completed' },
    { id: 'tx-c3-1006', date: '2026-08-02', type: 'Investment', description: 'Nova Crypto Basket allocation', amount: -6000, status: 'Completed' },
    { id: 'tx-c3-1007', date: '2026-07-27', type: 'Withdrawal', description: 'Withdrawal to linked account', amount: -1000, status: 'Completed' },
    { id: 'tx-c3-1008', date: '2026-07-19', type: 'Deposit', description: 'Wire transfer', amount: 9500, status: 'Completed' },
  ],
};

export function getTransactions(clientId: string): Transaction[] {
  return transactionsByClient[clientId] ?? transactionsByClient['client-2'];
}

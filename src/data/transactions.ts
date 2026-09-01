// Fictional demo transaction history — simulated for prototype purposes only.
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

export const transactions: Transaction[] = [
  { id: 'tx-1001', date: '2026-08-28', type: 'Return', description: 'Quantum Growth Fund (Demo) payout', amount: 482.5, status: 'Completed' },
  { id: 'tx-1002', date: '2026-08-25', type: 'Investment', description: 'Balanced Growth Plan (Demo) allocation', amount: -2000, status: 'Completed' },
  { id: 'tx-1003', date: '2026-08-22', type: 'Deposit', description: 'Bank transfer (Demo)', amount: 5000, status: 'Completed' },
  { id: 'tx-1004', date: '2026-08-19', type: 'Withdrawal', description: 'Withdrawal to linked account (Demo)', amount: -1200, status: 'Pending' },
  { id: 'tx-1005', date: '2026-08-14', type: 'Return', description: 'Steadfast Treasury Bonds (Demo) interest', amount: 96.2, status: 'Completed' },
  { id: 'tx-1006', date: '2026-08-10', type: 'Investment', description: 'Nova Crypto Basket (Demo) allocation', amount: -750, status: 'Completed' },
  { id: 'tx-1007', date: '2026-08-05', type: 'Withdrawal', description: 'Withdrawal to linked account (Demo)', amount: -300, status: 'Failed' },
  { id: 'tx-1008', date: '2026-07-30', type: 'Deposit', description: 'Card top-up (Demo)', amount: 1500, status: 'Completed' },
  { id: 'tx-1009', date: '2026-07-24', type: 'Return', description: 'Horizon Real Estate Trust (Demo) distribution', amount: 210.0, status: 'Completed' },
  { id: 'tx-1010', date: '2026-07-18', type: 'Investment', description: 'Frontier Innovation Fund (Demo) allocation', amount: -3000, status: 'Completed' },
  { id: 'tx-1011', date: '2026-07-12', type: 'Deposit', description: 'Bank transfer (Demo)', amount: 2200, status: 'Completed' },
  { id: 'tx-1012', date: '2026-07-06', type: 'Withdrawal', description: 'Withdrawal to linked account (Demo)', amount: -450, status: 'Completed' },
];

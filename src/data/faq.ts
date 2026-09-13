export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const faqItems: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'How do I create and secure my account?',
    answer: 'Create an account with your name, email and password, then complete email verification. Use a unique password and keep your login credentials private.',
    category: 'Account',
  },
  {
    id: 'faq-2',
    question: 'How are account balances updated?',
    answer: 'Account balances are controlled by the server-side account ledger. A deposit or transfer does not become available until the corresponding backend verification and processing requirements are satisfied.',
    category: 'Account',
  },
  {
    id: 'faq-3',
    question: 'How are deposits confirmed?',
    answer: 'A submitted transaction reference is treated as pending until the configured payment or blockchain verification service independently confirms the transaction. Submitting a reference alone does not credit an account.',
    category: 'Deposits',
  },
  {
    id: 'faq-4',
    question: 'How do withdrawals work?',
    answer: 'Withdrawal requests are validated against the account balance and supported payout method, then processed through the configured review and payment workflow. Status remains visible in transaction history.',
    category: 'Withdrawals',
  },
  {
    id: 'faq-5',
    question: 'Can I transfer funds to another account?',
    answer: 'Transfers can be sent to an eligible Tarafab.XAi account using the supported recipient information. The server validates the sender balance, recipient and transaction before recording the ledger movement.',
    category: 'Transfers',
  },
  {
    id: 'faq-6',
    question: 'How is market information displayed?',
    answer: 'Market information is obtained from the configured market-data service. If that service is unavailable or disabled, the interface reports that market data is unavailable rather than displaying invented prices.',
    category: 'Markets',
  },
  {
    id: 'faq-7',
    question: 'What should I do if I cannot access my account?',
    answer: 'Use the password-reset flow or contact support. Never send your password, authentication codes or private wallet credentials to support or another user.',
    category: 'Security',
  },
];

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
}

export const helpArticles: HelpArticle[] = [
  { id: 'help-1', title: 'Getting started with your account', category: 'Getting Started', summary: 'Create your account, verify your email and securely access your personal dashboard.' },
  { id: 'help-2', title: 'Understanding your account balance', category: 'Account', summary: 'Learn how available, invested and pending balances are represented in your account.' },
  { id: 'help-3', title: 'Submitting a deposit', category: 'Deposits', summary: 'Review supported deposit methods and follow the verification process before funds become available.' },
  { id: 'help-4', title: 'Reviewing transactions', category: 'Transactions', summary: 'Search transaction history by type, status and reference information.' },
  { id: 'help-5', title: 'Managing withdrawals', category: 'Withdrawals', summary: 'Review withdrawal requests, processing status and supported payout methods.' },
  { id: 'help-6', title: 'Protecting your account', category: 'Security', summary: 'Use strong credentials, secure your sessions and never share authentication secrets.' },
];

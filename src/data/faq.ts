// Fictional FAQ / help content for the demo Support page.
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const faqItems: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Is Tarafab.XAi a real investment platform?',
    answer: 'No. Tarafab.XAi is a fictional demo prototype built to showcase a fintech-style user interface. All balances, returns, and transactions are simulated mock data — no real money, accounts, or financial products are involved.',
    category: 'General',
  },
  {
    id: 'faq-2',
    question: 'Can I actually deposit or withdraw money?',
    answer: 'No real transactions occur anywhere in this demo. Deposit, withdrawal, and investment actions in the interface are illustrative only and do not move real funds.',
    category: 'General',
  },
  {
    id: 'faq-3',
    question: 'Are the investment returns guaranteed?',
    answer: 'No figures shown are guaranteed or real. All annual return ranges, performance charts, and portfolio statistics are fictional simulations created for demonstration purposes only.',
    category: 'Investments',
  },
  {
    id: 'faq-4',
    question: 'How is my portfolio allocation calculated?',
    answer: 'In this prototype, portfolio allocation values are pulled from static mock data files bundled with the app — there is no live calculation against real markets or accounts.',
    category: 'Portfolio',
  },
  {
    id: 'faq-5',
    question: 'Does the security settings page use real authentication?',
    answer: 'No. The password change form and two-factor authentication toggle are UI mockups only. No credentials are transmitted, stored, or validated anywhere.',
    category: 'Security',
  },
  {
    id: 'faq-6',
    question: 'Can I change the theme or currency display?',
    answer: 'Yes — the light/dark theme toggle is fully functional for demonstration, and the currency display format is a cosmetic preference that changes how mock figures are formatted.',
    category: 'Settings',
  },
  {
    id: 'faq-7',
    question: 'Who should use this prototype?',
    answer: 'Designers, developers, and product teams exploring a premium fintech UI/UX pattern for dashboards, analytics, and investment-style flows in a safe, data-free sandbox.',
    category: 'General',
  },
];

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
}

export const helpArticles: HelpArticle[] = [
  { id: 'help-1', title: 'Getting started with the demo dashboard', category: 'Getting Started', summary: 'A quick tour of the dashboard layout, portfolio summary cards, and simulated performance chart.' },
  { id: 'help-2', title: 'Understanding demo investment plans', category: 'Investments', summary: 'Learn how simulated return ranges, durations, and risk badges are presented across investment plan cards.' },
  { id: 'help-3', title: 'Reading your simulated portfolio breakdown', category: 'Portfolio', summary: 'A walkthrough of the allocation donut chart, allocation table, and key portfolio statistic cards.' },
  { id: 'help-4', title: 'Filtering mock transactions', category: 'Transactions', summary: 'How to search and filter the fictional transaction history by type and status.' },
  { id: 'help-5', title: 'Exploring analytics time ranges', category: 'Analytics', summary: 'How the 1W / 1M / 3M / 1Y / All selectors reshape the simulated performance chart and summary stats.' },
  { id: 'help-6', title: 'Customizing interface preferences', category: 'Settings', summary: 'Toggle between light and dark themes and change the cosmetic currency display format.' },
];

import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-8 dark:border-navy-600/60 dark:bg-navy-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Logo />
        <p className="max-w-xl text-xs text-slate-500 dark:text-slate-400">
          Tarafab.XAi is a <strong>fictional demo</strong> fintech interface prototype. Nothing on this site
          constitutes real financial advice, and no real accounts, funds, or investment products are involved.
          All balances, returns, and transactions are simulated mock data.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">© 2026 Tarafab.XAi Demo. Not a real company.</p>
      </div>
    </footer>
  );
}

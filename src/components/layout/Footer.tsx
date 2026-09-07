import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-8 dark:border-navy-600/60 dark:bg-navy-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link to="/terms" className="hover:text-teal-600 hover:underline dark:hover:text-teal-400">
              Terms of Use
            </Link>
            <Link to="/privacy" className="hover:text-teal-600 hover:underline dark:hover:text-teal-400">
              Privacy Policy
            </Link>
            <Link to="/support" className="hover:text-teal-600 hover:underline dark:hover:text-teal-400">
              Support
            </Link>
          </nav>
        </div>
        <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
          Tarafab.XAi is a <strong>fictional demo</strong> fintech interface prototype. Nothing on this site
          constitutes real financial advice, and no real accounts, funds, or investment products are involved.
          All balances, returns, and transactions are simulated mock data. See our{' '}
          <Link to="/terms" className="underline hover:text-teal-600 dark:hover:text-teal-400">
            Terms of Use
          </Link>{' '}
          for details.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">© 2026 Tarafab.XAi Demo. Not a real company.</p>
      </div>
    </footer>
  );
}

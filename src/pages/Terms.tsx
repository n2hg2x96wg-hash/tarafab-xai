import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { Footer } from '../components/layout/Footer';
import { Card } from '../components/ui/Card';

export function Terms() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-navy-950">
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <Logo />
        <Link to="/" className="text-sm font-semibold text-teal-600 hover:underline dark:text-teal-400">
          Back to home
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <Card className="prose prose-slate max-w-none dark:prose-invert">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Terms of Use</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: August 2026</p>

          <div className="mt-6 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <strong>Important:</strong> Tarafab.XAi is a fictional demo fintech interface built to showcase product
            design and engineering. It is not a real investment platform, broker-dealer, or financial institution.
          </div>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">1. Simulated data only</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            All account balances, portfolio holdings, transactions, performance charts, and investment plans
            displayed in this application are simulated mock data generated for demonstration purposes. Nothing on
            this site represents a real account, real funds, or an actual financial product.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">2. No real financial advice</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Content on this platform does not constitute financial, investment, tax, or legal advice, and no
            returns, gains, or outcomes shown are guaranteed or indicative of real-world results.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">3. No real banking connections</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This application never requests, stores, or processes real banking details, payment card numbers, or
            other sensitive financial credentials. Test account logins are for demonstration access only.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">4. Test accounts</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Test account credentials shown on the sign-in page are provided for evaluation purposes and do not
            grant access to any real funds or personal financial information.
          </p>
        </Card>
      </main>
      <Footer />
    </div>
  );
}

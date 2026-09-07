import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { Footer } from '../components/layout/Footer';
import { Card } from '../components/ui/Card';

export function Privacy() {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: August 2026</p>

          <div className="mt-6 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <strong>Important:</strong> Tarafab.XAi is a fictional demo prototype. This policy describes how the
            demo application behaves; it is not a real privacy policy for a live financial service.
          </div>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Data we collect</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This application does not have a backend server or database. Session state (such as your login token,
            theme, and currency preference) is stored only in your browser's local storage and is never transmitted
            to any external server.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">No real banking or payment data</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            We never ask for, collect, or store real bank account numbers, card details, government identifiers, or
            other sensitive financial information. Account verification ("KYC") shown in the app is a simulated UI
            flow only.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Test account credentials</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The email addresses and passwords used for the demo test accounts are fictional and published publicly
            on the sign-in page for evaluation purposes.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Contact</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This is a demo project without a real support team; use the in-app Support page to see how a contact
            flow would look in a production platform.
          </p>
        </Card>
      </main>
      <Footer />
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { Footer } from '../components/layout/Footer';
import { Card } from '../components/ui/Card';
import { NavIcon } from '../components/layout/NavIcon';

const features = [
  {
    icon: 'trending-up',
    title: 'Investment Plans',
    description: 'Explore plans across risk tiers with clear return ranges, durations, and minimums.',
  },
  {
    icon: 'pie-chart',
    title: 'Portfolio Visualization',
    description: 'See a clear asset allocation breakdown across stocks, crypto, bonds, real estate, and cash.',
  },
  {
    icon: 'bar-chart',
    title: 'Interactive Analytics',
    description: 'Toggle between 1W, 1M, 3M, 1Y, and All time ranges on your performance chart.',
  },
  {
    icon: 'list',
    title: 'Transaction History',
    description: 'Browse deposits, withdrawals, investments, and returns with searchable filters.',
  },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-navy-950">
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <Logo />
        <Link
          to="/login"
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 shadow-md shadow-teal-500/20 transition-transform hover:scale-105 hover:bg-teal-400"
        >
          Log In
        </Link>
      </header>

      <section className="animate-fade-in mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center lg:py-24">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-500">
          Modern Investment Platform
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
          Invest smarter, <span className="text-teal-500">built for you</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Tarafab.XAi brings together portfolio management, investment plans, and performance analytics in one
          clean, secure dashboard.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/login"
            className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/30 transition-transform hover:scale-105 hover:bg-teal-400"
          >
            Log In to Your Account
          </Link>
          <Link
            to="/terms"
            className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-navy-500 dark:text-slate-200 dark:hover:bg-navy-800"
          >
            Read Terms &amp; Disclosures
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => (
          <Card
            key={feature.title}
            hoverable
            className="animate-slide-up flex flex-col items-start gap-3"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
              <NavIcon name={feature.icon} />
            </span>
            <h3 className="font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description}</p>
          </Card>
        ))}
      </section>

      <Footer />
    </div>
  );
}

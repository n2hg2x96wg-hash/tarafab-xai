import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { DemoBanner } from '../components/layout/DemoBanner';
import { Footer } from '../components/layout/Footer';
import { Card } from '../components/ui/Card';
import { NavIcon } from '../components/layout/NavIcon';

const features = [
  {
    icon: 'trending-up',
    title: 'Simulated Investment Plans',
    description: 'Explore demo plans with fictional return ranges, durations, and clearly labeled risk levels.',
  },
  {
    icon: 'pie-chart',
    title: 'Portfolio Visualization',
    description: 'See a mock asset allocation breakdown across stocks, crypto, bonds, real estate, and cash.',
  },
  {
    icon: 'bar-chart',
    title: 'Interactive Analytics',
    description: 'Toggle between 1W, 1M, 3M, 1Y, and All time ranges on a simulated performance chart.',
  },
  {
    icon: 'list',
    title: 'Mock Transaction History',
    description: 'Browse fictional deposits, withdrawals, investments, and returns with searchable filters.',
  },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-navy-950">
      <DemoBanner />
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <Logo />
        <Link
          to="/dashboard"
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 shadow-md shadow-teal-500/20 transition-transform hover:scale-105 hover:bg-teal-400"
        >
          Enter Demo Dashboard
        </Link>
      </header>

      <section className="animate-fade-in mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center lg:py-24">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-500">
          Fictional Investment Platform · Demo Prototype
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
          Invest smarter, <span className="text-teal-500">simulated</span> for you.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Tarafab.XAi is a premium, fictional fintech interface showcasing what a modern investment platform could
          look like — powered entirely by mock data. No real accounts, no real money, no real advice.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/dashboard"
            className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/30 transition-transform hover:scale-105 hover:bg-teal-400"
          >
            Enter Demo Dashboard
          </Link>
          <Link
            to="/investments"
            className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-navy-500 dark:text-slate-200 dark:hover:bg-navy-800"
          >
            View Investment Plans
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

      <section className="mx-auto max-w-4xl px-6 pb-20 text-center">
        <Card className="border-teal-500/20 bg-teal-500/5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">This is a fictional demo.</strong> Tarafab.XAi does not
            hold real funds, provide real financial advice, or connect to any real banking, crypto, or payment
            systems. Every number you see is generated mock data intended purely to demonstrate a fintech user
            interface.
          </p>
        </Card>
      </section>

      <Footer />
    </div>
  );
}

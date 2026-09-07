import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Logo } from '../components/layout/Logo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

export function Login() {
  const { isAuthenticated, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';
    return <Navigate to={from} replace />;
  }

  const attemptLogin = (loginEmail: string, loginPassword: string) => {
    setError(null);
    setSubmitting(true);
    const success = login(loginEmail, loginPassword);
    setSubmitting(false);

    if (success) {
      showToast('Welcome back! You have signed in successfully.');
      const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } else {
      setError('Invalid email or password. Please try again.');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    attemptLogin(email, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-navy-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sign in to your account</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Access your portfolio, transactions, and account settings.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email address
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-navy-500 dark:bg-navy-700 dark:text-white"
                placeholder="you@tarafab.com"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-navy-500 dark:bg-navy-700 dark:text-white"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-teal-500 px-6 py-2.5 text-sm font-semibold text-navy-950 transition-transform hover:scale-[1.01] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

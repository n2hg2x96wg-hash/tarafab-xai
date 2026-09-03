import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../components/ui/Toast';

export function AdminLogin() {
  const { isAuthenticated, login } = useAdminAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/admin';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setSubmitting(true);
    const success = login(username, password);
    setSubmitting(false);

    if (success) {
      showToast('Welcome back! Login successful.');
      const from = (location.state as { from?: Location })?.from?.pathname ?? '/admin';
      navigate(from, { replace: true });
    } else {
      setError('Invalid username or password.');
      showToast('Login failed: invalid credentials.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Login</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in to access the Tarafab.XAi admin panel
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="admin-username"
              className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Username
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="admin"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          Demo credentials: <span className="font-mono">admin</span> /{' '}
          <span className="font-mono">congratulations2005@</span>
        </p>
      </Card>
    </div>
  );
}

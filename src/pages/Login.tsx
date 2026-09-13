import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-10">
      <div className="hero-grid absolute inset-0 opacity-30" />
      <div className="hero-orb hero-orb-one absolute -top-24 -left-20 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="hero-orb hero-orb-two absolute -bottom-28 -right-16 w-80 h-80 rounded-full bg-orange-500/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md animate-page-enter">
        <div className="text-center mb-6 animate-stagger-1">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 transition duration-300 group-hover:scale-110 group-hover:rotate-3">
              <span className="text-2xl">₿</span>
            </span>
            <span className="text-xl font-bold tracking-tight text-white">Terafab<span className="text-orange-400">.XAi</span></span>
          </Link>
        </div>

        <section className="glass rounded-3xl p-7 sm:p-9 border border-white/10 shadow-2xl shadow-black/30 backdrop-blur-xl animate-stagger-2">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300 text-xs mb-4">
              <span className="live-dot" /> Secure sign-in
            </div>
            <h1 className="text-3xl font-bold gradient-text">Welcome Back</h1>
            <p className="text-slate-400 mt-2">Sign in to continue to your account.</p>
          </div>

          {error && <div role="alert" className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-page-enter">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="animate-stagger-3">
              <label className="block text-sm font-medium mb-2" htmlFor="login-email">Email Address</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="you@example.com" />
            </div>

            <div className="animate-stagger-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium" htmlFor="login-password">Password</label>
              </div>
              <div className="relative">
                <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="w-full px-4 py-3 pr-20 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-orange-300 transition">{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            <div className="flex items-center animate-stagger-5">
              <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded accent-orange-500" />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-400">Remember me for 30 days</label>
            </div>

            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 animate-stagger-5">
              {loading ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Signing in...</span> : 'Sign In'}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-white/10 text-center text-sm text-slate-400 animate-stagger-5">
            Don't have an account? <Link to="/register" className="text-orange-400 hover:text-orange-300 transition">Create one here</Link>
          </div>
        </section>

        <p className="text-center text-xs text-slate-500 mt-5">Your session is protected by the application's configured authentication layer.</p>
      </div>
    </main>
  );
};

export default LoginPage;

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(formData.fullName, formData.email, formData.password, formData.confirmPassword);
      setCreated(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = formData.password.length >= 12 ? 'Strong password' : formData.password.length >= 8 ? 'Good password' : 'At least 8 characters';

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-10">
      <div className="hero-grid absolute inset-0 opacity-30" />
      <div className="hero-orb hero-orb-one absolute -top-24 -right-20 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="hero-orb hero-orb-two absolute -bottom-28 -left-16 w-80 h-80 rounded-full bg-orange-500/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md animate-page-enter">
        <div className="text-center mb-6 animate-stagger-1">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 transition duration-300 group-hover:scale-110 group-hover:-rotate-3">
              <span className="text-2xl">₿</span>
            </span>
            <span className="text-xl font-bold tracking-tight text-white">Terafab<span className="text-orange-400">.XAi</span></span>
          </Link>
        </div>

        <section className="glass rounded-3xl p-7 sm:p-9 border border-white/10 shadow-2xl shadow-black/30 backdrop-blur-xl animate-stagger-2">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300 text-xs mb-4">
              <span className="live-dot" /> Secure account setup
            </div>
            <h1 className="text-3xl font-bold gradient-text">{created ? 'Account Created' : 'Get Started'}</h1>
            <p className="text-slate-400 mt-2">{created ? 'Verify your email before signing in.' : 'Create your account in a few steps.'}</p>
          </div>

          {created ? (
            <div className="space-y-5 text-center animate-page-enter">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-2xl">✓</div>
              <p className="text-sm leading-6 text-slate-300">Your account was created successfully. Check your email for the verification link, then sign in.</p>
              <button type="button" onClick={() => navigate('/login')} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 transition duration-300">Continue to Sign In</button>
            </div>
          ) : (
            <>
              {error && <div role="alert" className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-page-enter">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="animate-stagger-3"><label className="block text-sm font-medium mb-2" htmlFor="fullName">Full Name</label><input id="fullName" type="text" name="fullName" value={formData.fullName} onChange={handleChange} required autoComplete="name" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="John Doe" /></div>
                <div className="animate-stagger-4"><label className="block text-sm font-medium mb-2" htmlFor="email">Email Address</label><input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="you@example.com" /></div>
                <div className="animate-stagger-5"><label className="block text-sm font-medium mb-2" htmlFor="password">Password</label><div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} required minLength={8} autoComplete="new-password" className="w-full px-4 py-3 pr-20 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="••••••••" /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-orange-300 transition">{showPassword ? 'Hide' : 'Show'}</button></div><p className="text-xs text-slate-500 mt-1">{strength}</p></div>
                <div className="animate-stagger-5"><label className="block text-sm font-medium mb-2" htmlFor="confirmPassword">Confirm Password</label><div className="relative"><input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required minLength={8} autoComplete="new-password" className="w-full px-4 py-3 pr-20 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 focus:outline-none transition duration-300 text-white placeholder-slate-500 hover:bg-white/[0.07]" placeholder="••••••••" /><button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-orange-300 transition">{showConfirmPassword ? 'Hide' : 'Show'}</button></div></div>
                <div className="text-xs leading-5 text-slate-400 animate-stagger-5">By registering, you agree to our <Link to="/terms" className="text-orange-400 hover:text-orange-300 transition">Terms of Service</Link> and <Link to="/privacy" className="text-orange-400 hover:text-orange-300 transition">Privacy Policy</Link>.</div>
                <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 animate-stagger-5">{loading ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating account...</span> : 'Create Account'}</button>
              </form>
              <div className="mt-7 pt-6 border-t border-white/10 text-center text-sm text-slate-400 animate-stagger-5">Already have an account? <Link to="/login" className="text-orange-400 hover:text-orange-300 transition">Sign in here</Link></div>
            </>
          )}
        </section>

        <p className="text-center text-xs text-slate-500 mt-5">Use a valid email address so account verification can be completed.</p>
      </div>
    </main>
  );
};

export default RegisterPage;

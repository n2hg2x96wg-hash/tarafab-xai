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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex w-12 h-12 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center mb-4"><span className="text-2xl">₿</span></div>
            <h1 className="text-2xl font-bold gradient-text">{created ? 'Account Created' : 'Get Started'}</h1>
            <p className="text-slate-400 mt-2">{created ? 'Verify your email before signing in.' : 'Create your account'}</p>
          </div>

          {created ? (
            <div className="space-y-5 text-center">
              <p className="text-sm text-slate-300">Your account was created successfully. Check your email for the verification link, then sign in.</p>
              <button type="button" onClick={() => navigate('/login')} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold">Continue to Sign In</button>
            </div>
          ) : (
            <>
              {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium mb-2" htmlFor="fullName">Full Name</label><input id="fullName" type="text" name="fullName" value={formData.fullName} onChange={handleChange} required autoComplete="name" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none transition text-white placeholder-slate-500" placeholder="John Doe" /></div>
                <div><label className="block text-sm font-medium mb-2" htmlFor="email">Email Address</label><input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none transition text-white placeholder-slate-500" placeholder="you@example.com" /></div>
                <div><label className="block text-sm font-medium mb-2" htmlFor="password">Password</label><input id="password" type="password" name="password" value={formData.password} onChange={handleChange} required minLength={8} autoComplete="new-password" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none transition text-white placeholder-slate-500" placeholder="••••••••" /><p className="text-xs text-slate-400 mt-1">At least 8 characters</p></div>
                <div><label className="block text-sm font-medium mb-2" htmlFor="confirmPassword">Confirm Password</label><input id="confirmPassword" type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required minLength={8} autoComplete="new-password" className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-orange-400 focus:outline-none transition text-white placeholder-slate-500" placeholder="••••••••" /></div>
                <div className="text-xs text-slate-400">By registering, you agree to our <Link to="/terms" className="text-orange-400 hover:text-orange-300">Terms of Service</Link> and <Link to="/privacy" className="text-orange-400 hover:text-orange-300">Privacy Policy</Link>.</div>
                <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed mt-6">{loading ? 'Creating Account...' : 'Create Account'}</button>
              </form>
              <div className="mt-6 text-center text-sm text-slate-400">Already have an account? <Link to="/login" className="text-orange-400 hover:text-orange-300">Sign in here</Link></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

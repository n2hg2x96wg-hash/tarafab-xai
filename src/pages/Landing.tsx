import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><span className="font-bold">₿</span></div><span className="font-bold text-lg gradient-text">Tarafab.XAi</span></div>
          <div className="flex items-center space-x-4"><Link to="/login" className="text-slate-300 hover:text-white transition">Sign In</Link><Link to="/register" className="px-6 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium">Get Started</Link></div>
        </div>
      </nav>
      <section className="pt-32 pb-20 px-4"><div className="max-w-4xl mx-auto text-center">
        <div className="mb-8 flex justify-center"><div className="relative w-32 h-32"><div className="absolute inset-0 animate-rotate"><svg className="w-full h-full" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="45" stroke="url(#gradient1)" strokeWidth="2" opacity="0.3" /><circle cx="50" cy="50" r="35" stroke="url(#gradient2)" strokeWidth="1.5" opacity="0.4" /><defs><linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: '#f97316', stopOpacity: 1 }} /></linearGradient><linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{ stopColor: '#f97316', stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: '#dc2626', stopOpacity: 1 }} /></linearGradient></defs></svg></div><div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl">₿</span></div></div></div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fadeInUp"><span className="gradient-text">Next-Gen Investment Platform</span></h1>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">Trade Bitcoin, diversify your portfolio, and manage your account with modern financial tools and security.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16"><Link to="/register" className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold">Create Account</Link><Link to="/login" className="px-8 py-4 rounded-lg border border-white/20 text-white font-semibold">Sign In</Link></div>
      </div></section>
      <section className="py-20 px-4"><div className="max-w-6xl mx-auto"><h2 className="text-4xl font-bold text-center mb-16 gradient-text">Powerful Features</h2><div className="grid md:grid-cols-3 gap-8">{[
        ['🔒','Secure Access','Protected authentication and account controls.'],['📊','Account Analytics','Track verified account and transaction information.'],['⚡','Efficient Transactions','Manage supported account transactions through the platform.'],['🌍','Global Access','Access your account from supported devices and locations.'],['💼','Professional Tools','Modern account and transaction management tools.'],['🎯','Portfolio Management','Organize and monitor supported assets in one account.'],
      ].map(([icon,title,description]) => <div key={title} className="glass p-8 rounded-xl"><div className="text-4xl mb-4">{icon}</div><h3 className="text-xl font-semibold mb-2">{title}</h3><p className="text-slate-400">{description}</p></div>)}</div></div></section>
      <section className="py-20 px-4"><div className="max-w-4xl mx-auto text-center"><h2 className="text-4xl font-bold mb-8 gradient-text">Security First</h2><p className="text-lg text-slate-300 mb-12">Your account data and transaction records are protected by the security controls configured on the platform.</p><div className="grid md:grid-cols-2 gap-8"><div className="glass p-8 rounded-xl text-left"><h3 className="font-semibold mb-3 text-orange-400">✓ Authentication</h3><p className="text-slate-400">Authenticated access protects customer and administrator areas.</p></div><div className="glass p-8 rounded-xl text-left"><h3 className="font-semibold mb-3 text-orange-400">✓ Audit Trail</h3><p className="text-slate-400">Administrative accounting actions are recorded for review.</p></div></div></div></section>
      <section className="py-20 px-4"><div className="max-w-4xl mx-auto glass rounded-2xl p-12 text-center border-white/10"><h2 className="text-4xl font-bold mb-6">Ready to Get Started?</h2><p className="text-xl text-slate-300 mb-8">Create your account and access the platform.</p><Link to="/register" className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold">Create Your Account</Link></div></section>
      <footer className="border-t border-white/10 py-8 px-4"><div className="max-w-6xl mx-auto text-center text-slate-400 text-sm"><p>© 2026 Tarafab.XAi. All rights reserved.</p></div></footer>
    </div>
  );
};
export default LandingPage;

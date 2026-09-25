import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  ['01', 'Clear account view', 'See verified account information, recent activity and key account details without digging through clutter.'],
  ['02', 'Fast navigation', 'Move between the tools you use most with a simple, focused interface.'],
  ['03', 'Activity visibility', 'Keep important account activity and transaction history in one organized place.'],
  ['04', 'Responsive by design', 'A polished experience that adapts cleanly from desktop screens to mobile devices.'],
  ['05', 'Protected access', 'Customer authentication and administrative controls remain separated by design.'],
  ['06', 'Evidence over placeholders', 'Account balances and transaction states are shown only when supported by backend records.'],
];

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    const timer = window.setInterval(() => setActiveFeature((v) => (v + 1) % features.length), 3600);
    return () => { window.removeEventListener('scroll', onScroll); window.clearInterval(timer); };
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-[#060711] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="hero-grid" />
        <div className="hero-orb" style={{ width: 360, height: 360, top: 20 - scrollY * .05, left: '-5%', background: 'rgba(139,92,246,.12)' }} />
        <div className="hero-orb hero-orb-one" style={{ width: 300, height: 300, top: 280 - scrollY * .025, right: '-3%', background: 'rgba(34,211,238,.08)' }} />
      </div>

      <nav aria-label="Primary navigation" className="fixed top-0 inset-x-0 z-50 border-b border-white/[.07] bg-[#060711]/75 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-[76px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center font-bold text-lg shadow-lg shadow-violet-500/20">T</span><span><span className="font-bold tracking-tight">Tarafab<span className="text-cyan-300">.XAi</span></span><span className="hidden sm:block text-[8px] tracking-[.28em] text-slate-500 mt-0.5">DIGITAL PLATFORM</span></span></Link>
          <div className="flex items-center gap-3 sm:gap-7"><Link to="/login" className="text-sm text-slate-300 hover:text-white transition">Sign In</Link><Link to="/register" className="action-button primary">Get Started <span aria-hidden="true">↗</span></Link></div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="pt-32 sm:pt-40 pb-20 sm:pb-28 px-5"><div className="max-w-7xl mx-auto grid lg:grid-cols-[.86fr_1.14fr] gap-14 lg:gap-20 items-center min-h-[690px]">
          <div className="animate-page-in max-w-2xl"><div className="badge mb-7"><span className="live-dot" /> Customer preview <span className="text-slate-600">/</span> Public interface</div><h1 className="text-[48px] sm:text-[64px] lg:text-[74px] leading-[.98] tracking-[-.055em] font-bold">A clearer way to <span className="gradient-text">manage your account.</span></h1><p className="mt-7 text-base sm:text-lg leading-8 text-slate-400 max-w-xl">A focused digital platform designed around account visibility, organized activity and fast access—with financial information sourced from verified backend records.</p><div className="mt-9 flex flex-col sm:flex-row gap-3"><Link to="/register" className="action-button primary px-6 py-4">Create an account <span aria-hidden="true">↗</span></Link><Link to="/login" className="action-button px-6 py-4">Sign in <span aria-hidden="true">→</span></Link></div><div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-[10px] uppercase tracking-[.16em] text-slate-500"><span>Protected access</span><span>Recorded activity</span><span>Responsive interface</span></div></div>

          <div className="relative animate-fadeInUp"><div className="absolute -inset-8 bg-violet-500/[.06] blur-3xl rounded-full" /><div className="hero-shell relative p-4 sm:p-6 lg:p-7"><div className="relative z-10 flex items-center justify-between gap-4 pb-6 border-b border-white/[.07]"><div><p className="text-[9px] tracking-[.2em] text-slate-500">ACCOUNT OVERVIEW</p><p className="text-2xl sm:text-3xl font-semibold mt-2">Verified data only</p></div><span className="status-pill pending whitespace-nowrap">Awaiting sign in</span></div><div className="grid grid-cols-2 gap-3 mt-5"><div className="metric"><p className="text-[9px] uppercase tracking-[.15em] text-slate-500">Available balance</p><p className="text-xl font-semibold mt-2">—</p><p className="text-xs text-slate-600 mt-1">Not available before authentication</p></div><div className="metric"><p className="text-[9px] uppercase tracking-[.15em] text-slate-500">Market data</p><p className="text-xl font-semibold mt-2 text-cyan-300">—</p><p className="text-xs text-slate-600 mt-1">Available after sign in when configured</p></div></div><div className="dashboard-chart rounded-2xl h-[245px] mt-4 p-4 flex items-center justify-center"><div className="text-center"><div className="text-4xl text-cyan-300 mb-3" aria-hidden="true">⌁</div><p className="text-sm text-slate-400">Your account activity appears here after secure sign in.</p><p className="text-xs text-slate-600 mt-2">No sample balances or fabricated transactions.</p></div></div><div className="grid grid-cols-3 gap-3 mt-4">{['Transactions','Assets','Status'].map((label) => <div className="metric" key={label}><p className="text-[8px] uppercase tracking-[.14em] text-slate-500">{label}</p><p className="text-sm font-medium mt-2">—</p></div>)}</div><div className="mt-5 flex items-center gap-3"><div className="h-1 flex-1 rounded-full bg-white/5" /><span className="text-[9px] text-slate-600 tracking-widest">NOT CONNECTED</span></div></div></div>
        </div></section>

        <section className="px-5 py-24 sm:py-32 border-y border-white/[.06] bg-white/[.012]"><div className="max-w-6xl mx-auto"><div className="max-w-2xl mb-14"><span className="badge">THE PLATFORM</span><h2 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight">Designed with <span className="gradient-text">less noise.</span></h2><p className="mt-5 text-slate-400 leading-7">The interface puts the information that matters first, then gets out of the way.</p></div><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{features.map(([num, title, desc], i) => <button key={title} type="button" aria-pressed={activeFeature === i} onClick={() => setActiveFeature(i)} className={`feature-card glass rounded-2xl p-6 text-left ${activeFeature === i ? 'border-violet-400/35 bg-violet-500/[.035]' : ''}`}><div className="flex justify-between items-start"><span className="text-xs font-semibold text-cyan-300">{num}</span><span className="text-slate-600" aria-hidden="true">↗</span></div><h3 className="mt-12 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p></button>)}</div></div></section>

        <section className="px-5 py-28 sm:py-36"><div className="max-w-6xl mx-auto grid lg:grid-cols-[.9fr_1.1fr] gap-14 items-center"><div><span className="badge">CONTROL CENTER</span><h2 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight">Everything has <span className="gradient-text">a place.</span></h2><p className="mt-6 text-slate-400 leading-7 max-w-lg">Customer access, account activity and administrative controls are separated into focused areas so the experience stays easy to understand.</p></div><div className="space-y-3">{['Customer account access','Transaction history and status','Dashboard activity views','Administrative controls'].map((item, i) => <div key={item} className="glass rounded-2xl p-5 flex items-center gap-4 transition hover:translate-x-1"><span className="w-10 h-10 rounded-xl border border-white/10 bg-white/[.035] flex items-center justify-center text-xs text-cyan-300">0{i + 1}</span><div><p className="font-medium">{item}</p><p className="text-xs text-slate-500 mt-1">Focused interface module</p></div><span className="ml-auto text-slate-600" aria-hidden="true">→</span></div>)}</div></div></section>

        <section className="px-5 pb-28"><div className="max-w-6xl mx-auto hero-shell p-9 sm:p-14 text-center"><span className="badge">GET STARTED</span><h2 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight">Your account, <span className="gradient-text">better organized.</span></h2><p className="mt-5 text-slate-400 max-w-xl mx-auto leading-7">Create an account or sign in to explore the platform.</p><div className="mt-8 flex flex-col sm:flex-row justify-center gap-3"><Link to="/register" className="action-button primary px-7 py-4">Create Account <span aria-hidden="true">↗</span></Link><Link to="/login" className="action-button px-7 py-4">Sign In <span aria-hidden="true">→</span></Link></div></div></section>
      </main>

      <footer className="border-t border-white/[.07] py-8 px-5"><div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500"><p>© 2026 Tarafab.XAi. All rights reserved.</p><div className="flex gap-5"><Link to="/terms" className="hover:text-white">Terms</Link><Link to="/privacy" className="hover:text-white">Privacy</Link></div></div></footer>
    </div>
  );
};

export default LandingPage;

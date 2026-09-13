import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  ['◈', 'Secure Access', 'Protected authentication and account controls.'],
  ['⌁', 'Live Analytics', 'Interactive portfolio and account activity views.'],
  ['↗', 'Fast Actions', 'Move between supported account actions without friction.'],
  ['◎', 'Global Access', 'Responsive experience across supported devices.'],
  ['◇', 'Professional Tools', 'Modern account and transaction management tools.'],
  ['△', 'Portfolio View', 'Monitor supported assets and activity in one place.'],
];

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    const timer = window.setInterval(() => setActiveFeature((v) => (v + 1) % features.length), 2600);
    return () => { window.removeEventListener('scroll', onScroll); window.clearInterval(timer); };
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-[#050713] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="hero-grid" />
        <div className="hero-orb" style={{ width: 380, height: 380, top: 30 - scrollY * 0.08, left: '2%', background: 'rgba(124,92,255,.18)' }} />
        <div className="hero-orb" style={{ width: 300, height: 300, top: 330 - scrollY * 0.03, right: '4%', background: 'rgba(32,217,255,.12)', animationDelay: '-2s' }} />
        <div className="hero-orb" style={{ width: 220, height: 220, top: 790, left: '45%', background: 'rgba(255,79,216,.09)', animationDelay: '-4s' }} />
      </div>

      <nav className="fixed top-0 w-full z-50 bg-[#070916]/65 backdrop-blur-2xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7c5cff] via-[#9b5cff] to-[#20d9ff] flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:scale-110 group-hover:rotate-3">
              <span className="font-bold text-xl">T</span><span className="absolute inset-0 rounded-2xl border border-white/30" />
            </div>
            <div><span className="font-bold text-lg tracking-tight gradient-text">Tarafab.XAi</span><p className="text-[8px] tracking-[.28em] text-slate-500 -mt-0.5">DIGITAL PLATFORM</p></div>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link to="/login" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
            <Link to="/register" className="action-button primary">Get Started <span>↗</span></Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="min-h-[820px] pt-36 pb-24 px-4 flex items-center">
          <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-[.9fr_1.1fr] gap-12 lg:gap-20 items-center">
            <div className="text-center lg:text-left animate-page-in">
              <div className="inline-flex items-center gap-2 badge mb-7"><span className="live-dot" /> SYSTEM ONLINE <span className="text-slate-600">/</span> v2.0</div>
              <h1 className="text-5xl sm:text-6xl lg:text-[76px] font-bold leading-[.98] tracking-[-.045em] mb-7">
                <span className="gradient-text">Your money.</span><br /><span>One intelligent view.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-300/90 max-w-xl mb-9 leading-relaxed">A modern account interface built around clarity, activity visibility and fast access to the tools you use most.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/register" className="action-button primary px-7 py-4 text-base glow">Create Account <span>↗</span></Link>
                <Link to="/login" className="action-button px-7 py-4 text-base">Sign In <span>→</span></Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-6 justify-center lg:justify-start text-[11px] uppercase tracking-[.16em] text-slate-500"><span>Encrypted access</span><span>Real-time activity</span><span>Responsive</span></div>
            </div>

            <div className="relative h-[520px] animate-fadeInUp">
              <div className="absolute -inset-10 rounded-full bg-violet-500/10 blur-3xl" />
              <div className="absolute top-5 right-0 w-20 h-20 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 animate-float" />
              <div className="absolute bottom-8 left-0 w-16 h-16 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/5 animate-float" style={{ animationDelay:'-2s' }} />
              <div className="absolute inset-4 rotate-2 rounded-[2.2rem] border border-cyan-300/10 bg-cyan-300/[.025]" />
              <div className="absolute inset-0 glass rounded-[2.2rem] p-5 sm:p-7 overflow-hidden glow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[.08] via-transparent to-cyan-400/[.06]" />
                <div className="relative z-10 flex items-center justify-between mb-8"><div><p className="text-[10px] tracking-[.2em] text-slate-500">ACCOUNT OVERVIEW</p><p className="text-3xl sm:text-4xl font-bold mt-2 tracking-tight">$24,860.40</p></div><span className="status-pill success"><span className="live-dot mr-2" /> LIVE</span></div>
                <div className="relative z-10 h-52 rounded-2xl border border-white/10 bg-[#050817]/70 p-3 chart-shell">
                  <div className="absolute left-4 top-4 text-[9px] tracking-wider text-slate-600">ACTIVITY / 30D</div>
                  <svg viewBox="0 0 600 210" className="w-full h-full overflow-visible pt-4">
                    <defs><linearGradient id="tfLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c5cff" /><stop offset=".52" stopColor="#20d9ff" /><stop offset="1" stopColor="#ff4fd8" /></linearGradient><linearGradient id="tfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c5cff" stopOpacity=".28" /><stop offset="1" stopColor="#7c5cff" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0 175 C45 166 65 142 110 150 S165 130 215 132 S265 90 315 112 S365 82 410 92 S465 62 510 73 S560 48 600 32 L600 210 L0 210Z" fill="url(#tfFill)" />
                    <path d="M0 175 C45 166 65 142 110 150 S165 130 215 132 S265 90 315 112 S365 82 410 92 S465 62 510 73 S560 48 600 32" fill="none" stroke="url(#tfLine)" strokeWidth="4" strokeLinecap="round" strokeDasharray="1000" strokeDashoffset="1000"><animate attributeName="stroke-dashoffset" from="1000" to="0" dur="2.4s" fill="freeze" /></path>
                    <circle cx="510" cy="73" r="6" fill="#20d9ff"><animate attributeName="r" values="5;10;5" dur="1.6s" repeatCount="indefinite" /></circle>
                  </svg>
                </div>
                <div className="relative z-10 grid grid-cols-3 gap-3 mt-5">{[['Available','24,860.40'],['Activity','+12.8%'],['Assets','06']].map(([a,b]) => <div key={a} className="rounded-2xl bg-white/[.045] border border-white/10 p-4"><p className="text-[9px] tracking-[.14em] text-slate-500 uppercase">{a}</p><p className="font-semibold mt-2 text-sm">{b}</p></div>)}</div>
                <div className="relative z-10 mt-5 flex items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full w-2/3 rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-fuchsia-400 animate-shimmer" /></div><span className="text-[9px] tracking-widest text-slate-600">SYNCED</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 border-y border-white/5 bg-black/10">
          <div className="max-w-6xl mx-auto"><div className="text-center mb-14"><span className="badge">PLATFORM CORE</span><h2 className="text-4xl sm:text-5xl font-bold mt-5"><span className="gradient-text">Built to feel alive.</span></h2><p className="text-slate-400 mt-4 max-w-2xl mx-auto">Clean information architecture wrapped in motion, depth and a modern digital interface.</p></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{features.map(([icon,title,description],index)=><button key={title} onClick={()=>setActiveFeature(index)} className={`feature-card glass p-7 rounded-3xl text-left ${activeFeature===index?'border-violet-400/40 shadow-lg shadow-violet-500/10 -translate-y-1':''}`}><div className="flex items-center justify-between"><div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-400/10 border border-white/10 flex items-center justify-center text-xl text-cyan-300">{icon}</div><span className="text-[10px] tracking-widest text-slate-600">0{index+1}</span></div><h3 className="text-xl font-semibold mt-6 mb-2">{title}</h3><p className="text-slate-400 leading-relaxed">{description}</p><div className={`mt-6 h-1 rounded-full bg-white/5 overflow-hidden ${activeFeature===index?'opacity-100':'opacity-0'}`}><div className="h-full w-full bg-gradient-to-r from-violet-500 via-cyan-400 to-fuchsia-400 animate-shimmer" /></div></button>)}</div>
          </div>
        </section>

        <section className="py-28 px-4"><div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center"><div><span className="badge">CONTROL CENTER</span><h2 className="text-4xl sm:text-5xl font-bold mt-5 mb-6">Less noise. <span className="gradient-text">More control.</span></h2><p className="text-slate-400 text-lg leading-relaxed">Authentication, account activity and administrative controls are kept separate so each part of the platform has a clear purpose.</p></div><div className="space-y-4">{['Authenticated customer access','Transaction history and status tracking','Responsive dashboard analytics','Administrative audit controls'].map((item,i)=><div key={item} className="glass rounded-2xl p-5 flex items-center gap-4 hover:translate-x-2"><div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300">{String(i+1).padStart(2,'0')}</div><div><p className="font-medium">{item}</p><p className="text-xs text-slate-500 mt-1">Configured within the platform</p></div><span className="ml-auto text-slate-600">→</span></div>)}</div></div></section>

        <section className="py-24 px-4"><div className="max-w-5xl mx-auto glass rounded-[2.2rem] p-10 sm:p-16 text-center relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-br from-violet-500/[.12] via-transparent to-cyan-400/[.08]" /><div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-violet-500/10 blur-3xl" /><div className="relative"><div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 items-center justify-center text-2xl shadow-xl shadow-violet-500/25 animate-float">T</div><h2 className="text-4xl sm:text-5xl font-bold mt-7 mb-5">Ready when you are.</h2><p className="text-slate-400 text-lg mb-8">Step into the redesigned Tarafab.XAi experience.</p><Link to="/register" className="action-button primary px-8 py-4 text-base">Create Your Account <span>↗</span></Link></div></div></section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-9 px-4"><div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center text-slate-500 text-sm"><p>© 2026 Tarafab.XAi. All rights reserved.</p><div className="flex gap-5"><Link to="/terms" className="hover:text-white">Terms</Link><Link to="/privacy" className="hover:text-white">Privacy</Link></div></div></footer>
    </div>
  );
};

export default LandingPage;

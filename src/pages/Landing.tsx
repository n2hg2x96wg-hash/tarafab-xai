import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  ['🔒', 'Secure Access', 'Protected authentication and account controls.'],
  ['📊', 'Live Analytics', 'Interactive portfolio and account activity views.'],
  ['⚡', 'Fast Actions', 'Move between supported account actions without friction.'],
  ['🌍', 'Global Access', 'Responsive experience across supported devices.'],
  ['💼', 'Professional Tools', 'Modern account and transaction management tools.'],
  ['🎯', 'Portfolio View', 'Monitor supported assets and activity in one place.'],
];

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    const timer = window.setInterval(() => setActiveFeature((v) => (v + 1) % features.length), 2800);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(timer);
    };
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="hero-grid" />
        <div className="hero-orb" style={{ width: 320, height: 320, top: 80 - scrollY * 0.08, left: '8%', background: 'rgba(245,158,11,.13)' }} />
        <div className="hero-orb" style={{ width: 260, height: 260, top: 420 - scrollY * 0.03, right: '7%', background: 'rgba(59,130,246,.10)', animationDelay: '-2s' }} />
        <div className="hero-orb" style={{ width: 180, height: 180, top: 760, left: '42%', background: 'rgba(239,68,68,.08)', animationDelay: '-4s' }} />
      </div>

      <nav className="fixed top-0 w-full z-50 glass border-b border-white/10" style={{ backdropFilter: 'blur(22px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 via-orange-400 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:rotate-6 group-hover:scale-105">
              <span className="font-bold text-lg">₿</span>
            </div>
            <span className="font-bold text-lg gradient-text">Tarafab.XAi</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link to="/login" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
            <Link to="/register" className="action-button primary">Get Started <span>→</span></Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="min-h-[760px] pt-36 pb-24 px-4 flex items-center">
          <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-[1.05fr_.95fr] gap-14 items-center">
            <div className="text-center lg:text-left animate-page-in">
              <div className="inline-flex items-center gap-2 badge mb-7"><span className="live-dot" /> PLATFORM ONLINE</div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.02] mb-7">
                <span className="gradient-text">A smarter way</span><br />
                <span>to manage your portfolio.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mb-9 leading-relaxed">A modern account experience with interactive analytics, transaction tools and a dashboard designed to keep your financial activity organized.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/register" className="action-button primary px-7 py-4 text-base glow">Create Account <span>↗</span></Link>
                <Link to="/login" className="action-button px-7 py-4 text-base">Explore Dashboard <span>→</span></Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-5 justify-center lg:justify-start text-xs text-slate-500">
                <span>● Protected access</span><span>● Interactive analytics</span><span>● Responsive design</span>
              </div>
            </div>

            <div className="relative h-[440px] hidden sm:block animate-fadeInUp">
              <div className="absolute inset-8 rounded-[2rem] border border-white/10 bg-white/[.025] backdrop-blur-xl shadow-2xl shadow-black/40 rotate-2" />
              <div className="absolute inset-0 glass rounded-[2rem] p-6 overflow-hidden">
                <div className="orb orb-one" /><div className="orb orb-two" />
                <div className="flex items-center justify-between mb-7 relative">
                  <div><p className="text-xs text-slate-500">PORTFOLIO OVERVIEW</p><p className="text-3xl font-bold mt-1">$24,860.40</p></div>
                  <span className="status-pill success"><span className="live-dot mr-2" /> Live</span>
                </div>
                <div className="h-44 relative chart-shell rounded-2xl border border-white/5 bg-black/10 p-3">
                  <svg viewBox="0 0 600 190" className="w-full h-full overflow-visible">
                    <defs><linearGradient id="landingChart" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#f97316" /></linearGradient><linearGradient id="landingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" stopOpacity=".24" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0 160 C55 142 80 151 125 125 S205 143 250 104 S330 112 375 82 S455 104 505 58 S560 73 600 30 L600 190 L0 190Z" fill="url(#landingFill)" className="animate-pulse" />
                    <path d="M0 160 C55 142 80 151 125 125 S205 143 250 104 S330 112 375 82 S455 104 505 58 S560 73 600 30" fill="none" stroke="url(#landingChart)" strokeWidth="4" strokeLinecap="round" strokeDasharray="900" strokeDashoffset="900"><animate attributeName="stroke-dashoffset" from="900" to="0" dur="2.2s" fill="freeze" /></path>
                    <circle cx="505" cy="58" r="6" fill="#fbbf24"><animate attributeName="r" values="5;9;5" dur="1.7s" repeatCount="indefinite" /></circle>
                  </svg>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-5">
                  {[['Available','24,860.40'],['Activity','+12.8%'],['Assets','06']].map(([a,b]) => <div key={a} className="rounded-xl bg-white/[.035] border border-white/5 p-3"><p className="text-[10px] text-slate-500 uppercase">{a}</p><p className="font-semibold mt-1">{b}</p></div>)}
                </div>
                <div className="mt-5 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full w-2/3 bg-gradient-to-r from-amber-300 to-orange-500 rounded-full animate-shimmer" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 border-y border-white/5 bg-white/[.015]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14"><span className="badge">BUILT FOR CLARITY</span><h2 className="text-4xl sm:text-5xl font-bold mt-4"><span className="gradient-text">Everything in one view.</span></h2><p className="text-slate-400 mt-4 max-w-2xl mx-auto">The interface is designed to feel alive without getting in the way of the information that matters.</p></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map(([icon, title, description], index) => <button key={title} onClick={() => setActiveFeature(index)} className={`feature-card glass p-7 rounded-2xl text-left ${activeFeature === index ? 'border-amber-400/30 shadow-lg shadow-orange-500/10 -translate-y-1' : ''}`}>
                <div className="flex items-center justify-between"><div className="text-3xl">{icon}</div><span className="text-xs text-slate-600">0{index + 1}</span></div>
                <h3 className="text-xl font-semibold mt-5 mb-2">{title}</h3><p className="text-slate-400 leading-relaxed">{description}</p>
                <div className={`mt-5 h-1 rounded-full bg-white/5 overflow-hidden ${activeFeature === index ? 'opacity-100' : 'opacity-0'}`}><div className="h-full w-full bg-gradient-to-r from-amber-300 to-orange-500 origin-left animate-[shimmer_2s_linear_infinite]" /></div>
              </button>)}
            </div>
          </div>
        </section>

        <section className="py-28 px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <div><span className="badge">SECURITY + CONTROL</span><h2 className="text-4xl sm:text-5xl font-bold mt-5 mb-6">Designed to make your activity <span className="gradient-text">easy to understand.</span></h2><p className="text-slate-400 text-lg leading-relaxed">Authentication, transaction history and administrative controls are separated so the experience stays clean for everyday users.</p></div>
            <div className="space-y-4">
              {['Authenticated customer access','Transaction history and status tracking','Responsive dashboard analytics','Administrative audit controls'].map((item, i) => <div key={item} className="glass rounded-2xl p-5 flex items-center gap-4 hover:translate-x-2"><div className="w-9 h-9 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300">✓</div><div><p className="font-medium">{item}</p><p className="text-xs text-slate-500 mt-1">Configured within the platform</p></div><span className="ml-auto text-slate-600">→</span></div>)}
            </div>
          </div>
        </section>

        <section className="py-24 px-4"><div className="max-w-5xl mx-auto glass rounded-[2rem] p-10 sm:p-16 text-center relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-br from-amber-400/[.08] via-transparent to-orange-500/[.06]" /><div className="relative"><div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 items-center justify-center text-3xl shadow-xl shadow-orange-500/20 animate-float">₿</div><h2 className="text-4xl sm:text-5xl font-bold mt-7 mb-5">Ready to explore?</h2><p className="text-slate-400 text-lg mb-8">Create an account and experience the interactive platform.</p><Link to="/register" className="action-button primary px-8 py-4 text-base">Create Your Account <span>↗</span></Link></div></div></section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-9 px-4"><div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center text-slate-500 text-sm"><p>© 2026 Tarafab.XAi. All rights reserved.</p><div className="flex gap-5"><Link to="/terms" className="hover:text-white">Terms</Link><Link to="/privacy" className="hover:text-white">Privacy</Link></div></div></footer>
    </div>
  );
};

export default LandingPage;

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <span className="font-bold">₿</span>
            </div>
            <span className="font-bold text-lg gradient-text">Tarafab.XAi</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/login" className="text-slate-300 hover:text-white transition">
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium hover:shadow-lg hover:shadow-orange-500/50 transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Bitcoin Animation */}
          <div className="mb-8 flex justify-center">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 animate-rotate">
                <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="45" stroke="url(#gradient1)" strokeWidth="2" opacity="0.3" />
                  <circle cx="50" cy="50" r="35" stroke="url(#gradient2)" strokeWidth="1.5" opacity="0.4" />
                  <defs>
                    <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#f97316', stopOpacity: 1 }} />
                    </linearGradient>
                    <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#f97316', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#dc2626', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl">₿</span>
              </div>
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fadeInUp">
            <span className="gradient-text">Next-Gen Investment Platform</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            Trade Bitcoin, diversify your portfolio, and grow your wealth with institutional-grade tools and security.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
            <Link
              to="/register"
              className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-xl hover:shadow-orange-500/40 transition"
            >
              Create Account
            </Link>
            <Link
              to="/login"
              className="px-8 py-4 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5 transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 gradient-text">Powerful Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🔒',
                title: 'Bank-Grade Security',
                description: 'Enterprise-level encryption and multi-factor authentication protect your assets.',
              },
              {
                icon: '📊',
                title: 'Real-Time Analytics',
                description: 'Track your portfolio performance with advanced charting and detailed insights.',
              },
              {
                icon: '⚡',
                title: 'Fast Transactions',
                description: 'Lightning-fast deposits and withdrawals with low fees.',
              },
              {
                icon: '🌍',
                title: 'Global Access',
                description: 'Trade 24/7 from anywhere in the world with our mobile-optimized platform.',
              },
              {
                icon: '💼',
                title: 'Professional Tools',
                description: 'Advanced order types, API access, and automation for serious traders.',
              },
              {
                icon: '🎯',
                title: 'Diversification',
                description: 'Invest in multiple asset classes with a single account.',
              },
            ].map((feature, idx) => (
              <div key={idx} className="glass p-8 rounded-xl hover:border-white/20 transition">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-8 gradient-text">Security First</h2>
          <p className="text-lg text-slate-300 mb-12">
            Your funds and data are protected by the latest security protocols and compliance standards.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass p-8 rounded-xl text-left">
              <h3 className="font-semibold mb-3 text-orange-400">✓ Encryption</h3>
              <p className="text-slate-400">End-to-end encryption for all transactions and communications.</p>
            </div>
            <div className="glass p-8 rounded-xl text-left">
              <h3 className="font-semibold mb-3 text-orange-400">✓ Compliance</h3>
              <p className="text-slate-400">Fully compliant with international financial regulations.</p>
            </div>
            <div className="glass p-8 rounded-xl text-left">
              <h3 className="font-semibold mb-3 text-orange-400">✓ Audit</h3>
              <p className="text-slate-400">Regular security audits and penetration testing.</p>
            </div>
            <div className="glass p-8 rounded-xl text-left">
              <h3 className="font-semibold mb-3 text-orange-400">✓ Insurance</h3>
              <p className="text-slate-400">Assets protected with comprehensive insurance coverage.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto glass rounded-2xl p-12 text-center border-white/10">
          <h2 className="text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-slate-300 mb-8">Join thousands of investors and traders already using Tarafab.XAi.</p>
          <Link
            to="/register"
            className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold hover:shadow-xl hover:shadow-orange-500/40 transition"
          >
            Create Your Account Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-slate-400 text-sm">
          <p>© 2026 Tarafab.XAi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

import { Navigate } from 'react-router-dom';

export default LandingPage;

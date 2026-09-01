import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from './Logo';
import { NavIcon } from './NavIcon';
import { navItems } from './navItems';
import { useAppSettings } from '../../context/AppSettingsContext';
import { mockUser } from '../../data/user';

export function Topbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useAppSettings();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8 dark:border-navy-600/60 dark:bg-navy-900/90">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <NavIcon name="menu" />
        </button>
        <Logo className="lg:hidden" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <NavIcon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <NavIcon name="bell" />
        </button>
        <NavLink
          to="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-teal-300 dark:bg-navy-700"
        >
          {mockUser.avatarInitials}
        </NavLink>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-slate-900/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="animate-slide-up absolute inset-y-0 left-0 flex w-72 flex-col bg-white p-5 shadow-2xl dark:bg-navy-900">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-700"
              >
                <NavIcon name="close" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700',
                    )
                  }
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 text-xs text-teal-700 dark:text-teal-400">
              Fictional Demo — all data simulated.
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

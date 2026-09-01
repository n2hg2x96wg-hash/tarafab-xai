import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from './Logo';
import { NavIcon } from './NavIcon';
import { ClientSelector } from './ClientSelector';
import { navItems } from './navItems';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useClient } from '../../context/ClientContext';

export function Topbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useAppSettings();
  const { currentClient } = useClient();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/50 bg-gradient-to-r from-white to-slate-50/50 px-4 py-3 backdrop-blur lg:px-8 dark:border-navy-600/40 dark:from-navy-900 dark:to-navy-900/50">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <NavIcon name="menu" />
        </button>
        <Logo className="lg:hidden" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ClientSelector />
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
          className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <NavIcon name="bell" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500" />
        </button>
        <NavLink
          to="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-sm font-semibold text-white transition-transform hover:scale-110 dark:from-teal-500 dark:to-cyan-600"
        >
          {currentClient.avatarInitials}
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
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-navy-700"
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
          </div>
        </div>
      )}
    </header>
  );
}

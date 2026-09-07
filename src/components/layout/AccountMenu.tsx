import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NavIcon } from './NavIcon';

export function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { currentClient, logout } = useAuth();
  const navigate = useNavigate();

  if (!currentClient) return null;

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-700"
        aria-label="Account menu"
        aria-expanded={isOpen}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xs font-bold text-white">
          {currentClient.avatarInitials}
        </div>
        <span className="hidden sm:inline">{currentClient.name.split(' ')[0]}</span>
        <NavIcon name={isOpen ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-600 dark:bg-navy-800">
            <div className="border-b border-slate-100 p-4 dark:border-navy-600/60">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-sm font-bold text-white">
                  {currentClient.avatarInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {currentClient.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">{currentClient.email}</p>
                </div>
              </div>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <NavIcon name="shield-check" className="h-3.5 w-3.5" />
                {currentClient.verificationStatus === 'Verified' ? 'Identity verified' : 'Verification pending'}
              </p>
            </div>
            <div className="p-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/profile');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
              >
                <NavIcon name="user" className="h-4 w-4" />
                Profile &amp; Settings
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
              >
                <NavIcon name="log-out" className="h-4 w-4" />
                Log Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { useAppSettings } from '../context/AppSettingsContext';
import { useClient } from '../context/ClientContext';
import { useToast } from '../components/ui/Toast';

const currencies = ['USD', 'EUR', 'GBP', 'JPY'];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-teal-500' : 'bg-slate-300 dark:bg-navy-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function Profile() {
  const { theme, toggleTheme, currency, setCurrency } = useAppSettings();
  const { currentClient } = useClient();
  const { showToast } = useToast();
  const [twoFactor, setTwoFactor] = useState(currentClient.twoFactorEnabled);
  const [notifications, setNotifications] = useState(currentClient.notifications);

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    showToast('Password change submitted.');
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile & Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Account information and preferences.</p>
      </div>

      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xl font-bold text-white">
          {currentClient.avatarInitials}
        </span>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{currentClient.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{currentClient.email}</p>
          <p className="mt-1 text-xs text-slate-400">
            Member since {currentClient.memberSince} · {currentClient.accountTier}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Security Settings</h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Current Password
              <input
                type="password"
                autoComplete="off"
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700"
              />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              New Password
              <input
                type="password"
                autoComplete="off"
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700"
              />
            </label>
            <button
              type="submit"
              className="mt-2 self-start rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 transition-transform hover:scale-105 hover:bg-teal-400"
            >
              Update Password
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-navy-600/60">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Two-Factor Authentication</p>
              <p className="text-xs text-slate-400">Additional security for your account.</p>
            </div>
            <Toggle checked={twoFactor} onChange={setTwoFactor} label="Two-factor authentication" />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Notification Preferences</h2>
          <ul className="flex flex-col gap-4">
            {(
              [
                ['productUpdates', 'Product Updates'],
                ['priceAlerts', 'Price Alerts'],
                ['monthlyStatement', 'Monthly Statement'],
                ['securityAlerts', 'Security Alerts'],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
                <Toggle
                  checked={notifications[key]}
                  onChange={(value) => setNotifications((prev) => ({ ...prev, [key]: value }))}
                  label={label}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Interface Preferences</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <span className="text-sm text-slate-700 dark:text-slate-200">Theme</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-navy-500 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <span className="text-sm text-slate-700 dark:text-slate-200">Currency Display</span>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none dark:border-navy-500 dark:bg-navy-700 dark:text-slate-300"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}

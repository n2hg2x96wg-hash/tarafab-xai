import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';

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
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function Profile() {
  const { theme, toggleTheme, currency, setCurrency } = useAppSettings();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({
    productUpdates: false,
    priceAlerts: false,
    monthlyStatement: false,
    securityAlerts: true,
  });

  if (!user) return null;

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile &amp; Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Account information and preferences.</p>
      </div>

      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xl font-bold text-white">
            {initials || '?'}
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{user.fullName}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
            <p className="mt-1 text-xs text-slate-400">Customer account</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-navy-700 dark:text-slate-300">
          {user.role === 'admin' ? 'Administrator' : 'Customer'}
        </span>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Security Settings</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-navy-600 dark:bg-navy-800/50">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Password</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Password changes are handled through the secure account recovery flow.</p>
            <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">Password management endpoint not enabled in this environment.</p>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-navy-600/60">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Two-Factor Authentication</p>
              <p className="text-xs text-slate-400">Available when a verified 2FA provider is configured.</p>
            </div>
            <Toggle checked={false} onChange={() => undefined} label="Two-factor authentication unavailable" />
          </div>
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">2FA is currently unavailable because no real TOTP or authentication provider is connected. No simulated codes are accepted.</p>
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
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Identity Verification</h2>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-navy-600 dark:bg-navy-800/50">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Verification service unavailable</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Identity verification requires a configured KYC provider and cannot be completed from this screen until that integration is connected.</p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Interface Preferences</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <span className="text-sm text-slate-700 dark:text-slate-200">Theme</span>
            <button type="button" onClick={toggleTheme} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-navy-500 dark:text-slate-300 dark:hover:bg-navy-700">
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <span className="text-sm text-slate-700 dark:text-slate-200">Currency Display</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none dark:border-navy-500 dark:bg-navy-700 dark:text-slate-300">
              {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}

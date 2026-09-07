import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
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
  const { currentClient, verifyAccount, activityLog } = useAuth();
  const { showToast } = useToast();
  const [twoFactor, setTwoFactor] = useState(currentClient?.twoFactorEnabled ?? false);
  const [notifications, setNotifications] = useState(
    currentClient?.notifications ?? {
      productUpdates: false,
      priceAlerts: false,
      monthlyStatement: false,
      securityAlerts: false,
    },
  );
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  if (!currentClient) return null;

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    showToast('Password change submitted.');
  };

  const handleTwoFactorToggle = (value: boolean) => {
    if (value) {
      setCode('');
      setCodeError(null);
      setTwoFactorModalOpen(true);
      return;
    }
    setTwoFactor(false);
    showToast('Two-factor authentication disabled.');
  };

  const confirmTwoFactor = () => {
    if (code.trim() !== '123456') {
      setCodeError('Incorrect code. For this demo, use 123456.');
      return;
    }
    setTwoFactor(true);
    setTwoFactorModalOpen(false);
    showToast('Two-factor authentication enabled.');
  };

  const startVerification = () => {
    setVerifyStep(0);
    setVerifyModalOpen(true);
  };

  const advanceVerification = () => {
    if (verifyStep < 2) {
      setVerifyStep((step) => step + 1);
      return;
    }
    verifyAccount();
    setVerifyModalOpen(false);
    showToast('Identity verification complete.');
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile & Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Account information and preferences.</p>
      </div>

      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xl font-bold text-white">
            {currentClient.avatarInitials}
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{currentClient.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{currentClient.email}</p>
            <p className="mt-1 text-xs text-slate-400">
              Member since {currentClient.memberSince} · {currentClient.accountTier} ·{' '}
              {currentClient.investorProfile} Investor
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge tone={currentClient.verificationStatus === 'Verified' ? 'success' : 'warning'}>
            {currentClient.verificationStatus === 'Verified' ? 'Identity Verified' : 'Verification Pending'}
          </Badge>
          {currentClient.verificationStatus !== 'Verified' && (
            <button
              type="button"
              onClick={startVerification}
              className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
            >
              Start Verification
            </button>
          )}
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
            <Toggle checked={twoFactor} onChange={handleTwoFactorToggle} label="Two-factor authentication" />
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-navy-600/60">
            <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">Recent Account Activity</p>
            {activityLog.length === 0 ? (
              <p className="text-xs text-slate-400">No recent activity recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...activityLog]
                  .reverse()
                  .slice(0, 5)
                  .map((entry) => (
                    <li key={entry.at} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{entry.type === 'login' ? 'Signed in' : 'Signed out'}</span>
                      <span>{new Date(entry.at).toLocaleString()}</span>
                    </li>
                  ))}
              </ul>
            )}
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

      <Modal open={twoFactorModalOpen} onClose={() => setTwoFactorModalOpen(false)} title="Verify Your Device">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Enter the 6-digit verification code sent to your device to enable two-factor authentication. For this
            demo, use <strong className="font-mono">123456</strong>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700"
          />
          {codeError && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{codeError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTwoFactorModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-500 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmTwoFactor}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-teal-400"
            >
              Verify &amp; Enable
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={verifyModalOpen} onClose={() => setVerifyModalOpen(false)} title="Account Verification">
        <div className="flex flex-col gap-4">
          {verifyStep === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Step 1 of 3: Confirm your personal details are up to date. This simulated flow mirrors a standard
              identity verification (KYC) process; no documents are uploaded or stored.
            </p>
          )}
          {verifyStep === 1 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Step 2 of 3: Simulated document check. In a production platform this step would confirm a
              government-issued ID.
            </p>
          )}
          {verifyStep === 2 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Step 3 of 3: Review and confirm. Selecting "Complete Verification" marks your demo account as verified.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setVerifyModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-500 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={advanceVerification}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-teal-400"
            >
              {verifyStep < 2 ? 'Continue' : 'Complete Verification'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

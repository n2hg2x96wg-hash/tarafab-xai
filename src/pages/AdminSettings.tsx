import { Card } from '../components/ui/Card';
import { Link } from 'react-router-dom';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';

export function AdminSettings() {
  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Back
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Platform configuration and system status
            </p>
          </div>
          <AdminLogoutButton />
        </div>

        <Card className="p-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Backend settings are not configured</h2>
            <p className="max-w-xl mx-auto mt-3 text-slate-600 dark:text-slate-400">
              Administrative settings are disabled until each option is connected to a protected backend configuration store. This prevents local-only controls and unverified system statistics from giving a misleading view of the platform.
            </p>
          </div>
        </Card>

        <Card className="p-6 mt-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Current deployment requirements</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400 list-disc pl-5">
            <li>Persistent production database</li>
            <li>Protected server-side configuration</li>
            <li>Real email, payment and blockchain providers where required</li>
            <li>Auditable administrative changes</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

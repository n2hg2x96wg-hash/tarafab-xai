import { Card } from '../components/ui/Card';
import { Link } from 'react-router-dom';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';

export function AdminInvestments() {
  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
              ← Back
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Investment Management</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Manage investment plans from verified backend data.
              </p>
            </div>
          </div>
          <AdminLogoutButton />
        </div>

        <Card className="p-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">No investment plans configured</h2>
            <p className="max-w-xl mx-auto mt-3 text-slate-600 dark:text-slate-400">
              Investment plans are not displayed until they are backed by a real backend configuration and accounting flow. This prevents unverified return rates or subscriber figures from being shown to administrators or customers.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

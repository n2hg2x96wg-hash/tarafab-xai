import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Link } from 'react-router-dom';

export function AdminDashboard() {
  const stats = [
    { label: 'Total Users', value: '1,248', change: '+12% this month' },
    { label: 'Active Sessions', value: '342', change: '+5% from yesterday' },
    { label: 'Total Assets', value: '$12.5M', change: '+8.3% this month' },
    { label: 'Demo Transactions', value: '5,231', change: '+142 today' },
  ];

  const recentActivity = [
    { id: 1, type: 'User Login', user: 'Alice Johnson', time: '2 minutes ago' },
    { id: 2, type: 'Investment Created', user: 'Bob Smith', time: '15 minutes ago' },
    { id: 3, type: 'Portfolio Updated', user: 'Carol Williams', time: '1 hour ago' },
    { id: 4, type: 'Transaction', user: 'David Brown', time: '2 hours ago' },
    { id: 5, type: 'Profile Updated', user: 'Eve Davis', time: '3 hours ago' },
  ];

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Admin Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Manage your Tarafab.XAi demo platform
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    {stat.value}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-lg"></div>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-4">{stat.change}</p>
            </Card>
          ))}
        </div>

        {/* Management Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Link to="/admin/users">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  User Management
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                View, edit, and manage user accounts
              </p>
              <Badge tone="neutral">1,248 users</Badge>
            </Card>
          </Link>

          <Link to="/admin/investments">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📈</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Investments
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                Manage investment plans and returns
              </p>
              <Badge tone="neutral">12 plans</Badge>
            </Card>
          </Link>

          <Link to="/admin/settings">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">⚙️</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Settings
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                Platform configuration and analytics
              </p>
              <Badge tone="neutral">System settings</Badge>
            </Card>
          </Link>
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Recent Activity
          </h2>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      {activity.user.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {activity.type}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      by {activity.user}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

import { Card } from '../components/ui/Card';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';

export function AdminSettings() {
  const [settings, setSettings] = useState({
    platformName: 'Tarafab.XAi',
    maintenanceMode: false,
    enableNewRegistrations: true,
    maxUsersPerDay: 100,
    analyticsEnabled: true,
    emailNotifications: true,
  });

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key],
    }));
  };

  const stats = [
    { label: 'API Calls Today', value: '45,231', trend: 'up' },
    { label: 'Database Size', value: '2.4 GB', trend: 'up' },
    { label: 'Uptime', value: '99.98%', trend: 'stable' },
    { label: 'Response Time', value: '125ms', trend: 'down' },
  ];

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
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

        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                {stat.trend === 'up' && '↑ Increasing'}
                {stat.trend === 'down' && '↓ Decreasing'}
                {stat.trend === 'stable' && '→ Stable'}
              </p>
            </Card>
          ))}
        </div>

        {/* Platform Settings */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Platform Settings
          </h2>

          <div className="space-y-6">
            {/* Platform Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Platform Name
              </label>
              <input
                type="text"
                value={settings.platformName}
                onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* Toggle Settings */}
            <div className="space-y-4">
              {[
                { key: 'maintenanceMode', label: 'Maintenance Mode', desc: 'Show maintenance banner to users' },
                { key: 'enableNewRegistrations', label: 'Enable New Registrations', desc: 'Allow new users to sign up' },
                { key: 'analyticsEnabled', label: 'Analytics Enabled', desc: 'Collect user analytics' },
                { key: 'emailNotifications', label: 'Email Notifications', desc: 'Send email alerts to admins' },
              ].map((setting) => (
                <div
                  key={setting.key}
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{setting.label}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{setting.desc}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(setting.key as keyof typeof settings)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings[setting.key as keyof typeof settings]
                        ? 'bg-blue-600'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        settings[setting.key as keyof typeof settings]
                          ? 'translate-x-6'
                          : 'translate-x-0.5'
                      } m-0.5`}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Max Users Per Day */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Max New Users Per Day
              </label>
              <input
                type="number"
                value={settings.maxUsersPerDay}
                onChange={(e) => setSettings({ ...settings, maxUsersPerDay: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
              Save Changes
            </button>
            <button className="px-6 py-2 bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 font-medium transition-colors">
              Cancel
            </button>
          </div>
        </Card>

        {/* System Info */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            System Information
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400">Version</span>
              <span className="text-slate-900 dark:text-white font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400">Last Updated</span>
              <span className="text-slate-900 dark:text-white font-medium">2 hours ago</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-600 dark:text-slate-400">Environment</span>
              <span className="text-slate-900 dark:text-white font-medium">Production</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

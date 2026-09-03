import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';

export function AdminUsers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const users = [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', status: 'Active', joinDate: '2024-01-15' },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', status: 'Active', joinDate: '2024-02-20' },
    { id: 3, name: 'Carol Williams', email: 'carol@example.com', status: 'Active', joinDate: '2024-03-10' },
    { id: 4, name: 'David Brown', email: 'david@example.com', status: 'Inactive', joinDate: '2024-01-05' },
    { id: 5, name: 'Eve Davis', email: 'eve@example.com', status: 'Active', joinDate: '2024-04-22' },
  ];

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Back to Dashboard
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">User Management</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Manage and monitor user accounts
            </p>
          </div>
          <AdminLogoutButton />
        </div>

        {/* Filters */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Search Users
              </label>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="name">Name</option>
                <option value="date">Join Date</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Users Table */}
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Join Date
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <td className="py-4 px-4 text-slate-900 dark:text-white font-medium">
                      {user.name}
                    </td>
                    <td className="py-4 px-4 text-slate-600 dark:text-slate-400">
                      {user.email}
                    </td>
                    <td className="py-4 px-4">
                      <Badge
                        tone={user.status === 'Active' ? 'success' : 'neutral'}
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-slate-600 dark:text-slate-400">
                      {new Date(user.joinDate).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4">
                      <button className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </Card>
      </div>
    </div>
  );
}

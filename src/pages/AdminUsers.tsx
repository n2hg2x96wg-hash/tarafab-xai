import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLogoutButton } from '../components/admin/AdminLogoutButton';
import api from '../context/ApiContext';

type AdminUser = {
  id: number;
  fullName: string;
  email: string;
  role: 'customer' | 'admin';
  emailVerified: number;
  createdAt: string;
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await api.get('/api/admin/users');
        if (active) setUsers(response.data.users ?? []);
      } catch (err) {
        console.error('Failed to load admin users:', err);
        if (active) setError('Unable to load users. Check your admin session and try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadUsers();
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = users.filter((user) =>
      user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    );

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'status') return Number(b.emailVerified) - Number(a.emailVerified);
      return a.fullName.localeCompare(b.fullName);
    });
  }, [users, searchTerm, sortBy]);

  const updateUser = async (user: AdminUser) => {
    const nextName = window.prompt('Full name', user.fullName)?.trim();
    if (!nextName || nextName === user.fullName) return;

    try {
      setSavingId(user.id);
      setError('');
      const response = await api.patch(`/api/admin/users/${user.id}`, {
        fullName: nextName,
        emailVerified: Boolean(user.emailVerified),
      });
      const updated = response.data.user as AdminUser;
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error('Failed to update user:', err);
      setError('Unable to update that user.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleVerification = async (user: AdminUser) => {
    try {
      setSavingId(user.id);
      setError('');
      const response = await api.patch(`/api/admin/users/${user.id}`, {
        fullName: user.fullName,
        emailVerified: !Boolean(user.emailVerified),
      });
      const updated = response.data.user as AdminUser;
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error('Failed to update verification:', err);
      setError('Unable to update verification status.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Back to Dashboard
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">User Management</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Manage and monitor user accounts</p>
          </div>
          <AdminLogoutButton />
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <Card className="p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Search Users</label>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="name">Name</option>
                <option value="date">Join Date</option>
                <option value="status">Verification</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Name', 'Email', 'Status', 'Join Date', 'Actions'].map((heading) => (
                    <th key={heading} className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-8 px-4 text-center text-slate-500">Loading users...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 px-4 text-center text-slate-500">No users found.</td></tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="py-4 px-4 text-slate-900 dark:text-white font-medium">{user.fullName}</td>
                      <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{user.email}</td>
                      <td className="py-4 px-4">
                        <Badge tone={user.emailVerified ? 'success' : 'neutral'}>
                          {user.emailVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-slate-600 dark:text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => updateUser(user)}
                            disabled={savingId === user.id}
                            className="text-blue-600 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 text-sm font-medium"
                          >
                            {savingId === user.id ? 'Saving...' : 'Edit'}
                          </button>
                          <button
                            onClick={() => toggleVerification(user)}
                            disabled={savingId === user.id}
                            className="text-slate-600 hover:text-slate-800 disabled:opacity-50 dark:text-slate-300 text-sm font-medium"
                          >
                            {user.emailVerified ? 'Unverify' : 'Verify'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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

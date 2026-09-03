import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../ui/Toast';

export function AdminLogoutButton() {
  const { logout } = useAdminAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    showToast('Logged out of the admin panel.');
    navigate('/admin/login', { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      Logout
    </button>
  );
}

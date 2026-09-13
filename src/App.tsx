import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedAdminRoute } from './components/auth/ProtectedAdminRoute';
import { Layout } from './components/Layout';
import LandingPage from './pages/Landing';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import DashboardPage from './pages/Dashboard';
import TransactionsPage from './pages/Transactions';
import DepositsPage from './pages/Deposits';
import WithdrawalsPage from './pages/Withdrawals';
import TransfersPage from './pages/Transfers';
import { Profile } from './pages/Profile';
import TermsPage from './pages/Terms';
import PrivacyPage from './pages/Privacy';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminInvestments } from './pages/AdminInvestments';
import { AdminSettings } from './pages/AdminSettings';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Layout><LandingPage /></Layout>} />
      <Route path="/login" element={<Layout><LoginPage /></Layout>} />
      <Route path="/register" element={<Layout><RegisterPage /></Layout>} />
      <Route path="/terms" element={<Layout><TermsPage /></Layout>} />
      <Route path="/privacy" element={<Layout><PrivacyPage /></Layout>} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/investments" element={<AdminInvestments />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
      </Route>

      {isAuthenticated ? (
        <>
          <Route path="/dashboard" element={<Layout><DashboardPage /></Layout>} />
          <Route path="/transactions" element={<Layout><TransactionsPage /></Layout>} />
          <Route path="/deposits" element={<Layout><DepositsPage /></Layout>} />
          <Route path="/withdrawals" element={<Layout><WithdrawalsPage /></Layout>} />
          <Route path="/transfers" element={<Layout><TransfersPage /></Layout>} />
          <Route path="/profile" element={<Layout><Profile /></Layout>} />
        </>
      ) : (
        <Route path="*" element={<Navigate to="/" />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <AdminAuthProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </AdminAuthProvider>
      </ToastProvider>
    </Router>
  );
}

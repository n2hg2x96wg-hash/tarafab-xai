import { createContext, useContext, useState, type ReactNode } from 'react';
import api from './ApiContext';

const ADMIN_SESSION_KEY = 'tarafab-xai-admin-session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface AdminSession {
  authenticated: true;
  username: string;
  expiresAt: number;
}

interface AdminAuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

function readSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.authenticated || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => readSession());

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await api.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password,
        rememberMe: false,
      });

      const { token, user } = response.data ?? {};
      if (!token || user?.role !== 'admin') return false;

      localStorage.setItem('token', token);
      const nextSession: AdminSession = {
        authenticated: true,
        username: user.email,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.localStorage.removeItem('token');
    setSession(null);
  };

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated: session !== null, username: session?.username ?? null, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}

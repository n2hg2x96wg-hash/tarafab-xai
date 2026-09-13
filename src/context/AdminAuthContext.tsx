import { createContext, useContext, useState, type ReactNode } from 'react';

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
  login: (username: string, password: string) => boolean;
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

  const login = (_username: string, _password: string): boolean => {
    // Admin authentication must be performed by the protected backend.
    // Client-side credentials are intentionally not accepted as an authorization boundary.
    return false;
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
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

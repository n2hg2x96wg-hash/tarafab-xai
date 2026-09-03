import { createContext, useContext, useState, type ReactNode } from 'react';

const ADMIN_SESSION_KEY = 'tarafab-xai-admin-session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// Demo credentials only — not suitable for a real production admin panel.
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'congratulations2005@';

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

  const login = (username: string, password: string): boolean => {
    if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const newSession: AdminSession = {
        authenticated: true,
        username: ADMIN_USERNAME,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(newSession));
      setSession(newSession);
      return true;
    }
    return false;
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        isAuthenticated: session !== null,
        username: session?.username ?? null,
        login,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}

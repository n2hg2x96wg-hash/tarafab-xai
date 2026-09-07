import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { clients, findClientByEmail, getClientById, type ClientProfile } from '../data/clients';

const AUTH_SESSION_KEY = 'tarafab-xai-session';
const ACTIVITY_LOG_KEY = 'tarafab-xai-activity-log';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_ACTIVITY_ENTRIES = 20;

export interface ActivityEntry {
  clientId: string;
  type: 'login' | 'logout';
  at: number;
}

interface Session {
  clientId: string;
  loginAt: number;
  expiresAt: number;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  currentClient: ClientProfile | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  verifyAccount: () => void;
  activityLog: ActivityEntry[];
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.clientId || !parsed.expiresAt || parsed.expiresAt < Date.now() || !getClientById(parsed.clientId)) {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

function readActivityLog(): ActivityEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActivityLog(entries: ActivityEntry[]) {
  window.localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(entries.slice(-MAX_ACTIVITY_ENTRIES)));
}

// Locally-managed verification status overrides (simulated KYC approvals), keyed by client id.
const VERIFICATION_OVERRIDES_KEY = 'tarafab-xai-verification-overrides';

function readVerificationOverrides(): Record<string, 'Verified'> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(VERIFICATION_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, 'Verified'>) : {};
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => readActivityLog());
  const [verificationOverrides, setVerificationOverrides] = useState<Record<string, 'Verified'>>(() =>
    readVerificationOverrides(),
  );

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      setSession(null);
    }, session.expiresAt - Date.now());
    return () => window.clearTimeout(timeout);
  }, [session]);

  const recordActivity = useCallback((clientId: string, type: ActivityEntry['type']) => {
    setActivityLog((prev) => {
      const next = [...prev, { clientId, type, at: Date.now() }].slice(-MAX_ACTIVITY_ENTRIES);
      writeActivityLog(next);
      return next;
    });
  }, []);

  const login = useCallback(
    (email: string, password: string): boolean => {
      const client = findClientByEmail(email);
      if (!client || client.password !== password) {
        return false;
      }
      const newSession: Session = {
        clientId: client.id,
        loginAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
      setSession(newSession);
      recordActivity(client.id, 'login');
      return true;
    },
    [recordActivity],
  );

  const logout = useCallback(() => {
    if (session) {
      recordActivity(session.clientId, 'logout');
    }
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    setSession(null);
  }, [session, recordActivity]);

  const verifyAccount = useCallback(() => {
    if (!session) return;
    setVerificationOverrides((prev) => {
      const next = { ...prev, [session.clientId]: 'Verified' as const };
      window.localStorage.setItem(VERIFICATION_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, [session]);

  const baseClient = session ? (getClientById(session.clientId) ?? null) : null;
  const currentClient: ClientProfile | null = baseClient
    ? { ...baseClient, verificationStatus: verificationOverrides[baseClient.id] ?? baseClient.verificationStatus }
    : null;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: session !== null,
        currentClient,
        login,
        logout,
        verifyAccount,
        activityLog: currentClient ? activityLog.filter((entry) => entry.clientId === currentClient.id) : [],
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

// Re-exported for the login screen's "quick sign-in" test account list.
export const testAccounts = clients;

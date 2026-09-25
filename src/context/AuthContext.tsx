import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (fullName: string, email: string, password: string, confirmPassword: string, termsAccepted: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = 'token';

function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function applyToken(token: string) {
  axios.defaults.headers.common.Authorization = `Bearer ${token}`;
}

function clearAppliedToken() {
  delete axios.defaults.headers.common.Authorization;
}

function getEmailRedirectUrl() {
  const basePath = import.meta.env.BASE_URL || '/';
  return new URL(`${basePath.replace(/\/$/, '')}/login`, window.location.origin).toString();
}

function mapSupabaseUser(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): User {
  const email = supabaseUser.email?.trim().toLowerCase() || '';
  const fullName = String(
    supabaseUser.user_metadata?.full_name
      || supabaseUser.user_metadata?.name
      || email.split('@')[0]
      || 'Account holder',
  );

  return {
    id: 0,
    fullName,
    email,
    role: 'customer',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const session = data.session;
        if (session) {
          setToken(session.access_token);
          setUser(mapSupabaseUser(session.user));
          applyToken(session.access_token);
        }
        return;
      }

      const savedToken = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
      if (savedToken && mounted) {
        setToken(savedToken);
        applyToken(savedToken);
      }
    };

    void restoreSession();

    if (!isSupabaseConfigured || !supabase) return () => { mounted = false; };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setToken(session.access_token);
        setUser(mapSupabaseUser(session.user));
        applyToken(session.access_token);
      } else {
        setToken(null);
        setUser(null);
        clearStoredToken();
        clearAppliedToken();
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error || !data.session) {
        throw new Error(error?.message || 'Login failed. Confirm your email address before signing in.');
      }

      const nextToken = data.session.access_token;
      setToken(nextToken);
      setUser(mapSupabaseUser(data.user));
      applyToken(nextToken);
      clearStoredToken();
      (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, nextToken);
      return;
    }

    try {
      const response = await axios.post('/api/auth/login', {
        email: normalizedEmail,
        password,
        rememberMe,
      });
      const nextToken = response.data.token as string;
      setToken(nextToken);
      setUser(response.data.user);
      clearStoredToken();
      (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, nextToken);
      applyToken(nextToken);
    } catch (error: any) {
      const code = error.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        throw new Error('Please verify your email before signing in.');
      }
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string, confirmPassword: string, termsAccepted: boolean) => {
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2) throw new Error('Please enter your full name.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (password !== confirmPassword) throw new Error('Passwords do not match.');
    if (!termsAccepted) throw new Error('Please accept the Terms of Service and Privacy Policy.');

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: normalizedName },
          emailRedirectTo: getEmailRedirectUrl(),
        },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        setToken(data.session.access_token);
        setUser(mapSupabaseUser(data.user));
        applyToken(data.session.access_token);
      }
      return;
    }

    try {
      const response = await axios.post('/api/auth/register', {
        fullName: normalizedName,
        email: normalizedEmail,
        password,
        confirmPassword,
        termsAccepted,
      });

      setToken(null);
      setUser(null);
      clearStoredToken();
      clearAppliedToken();

      if (response.data.verificationToken) {
        throw new Error(`ACCOUNT_CREATED:${response.data.verificationToken}`);
      }
      throw new Error('ACCOUNT_CREATED');
    } catch (error: any) {
      if (error.message?.startsWith('ACCOUNT_CREATED')) throw error;
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
  }, []);

  const logout = useCallback(() => {
    if (isSupabaseConfigured && supabase) void supabase.auth.signOut();
    setUser(null);
    setToken(null);
    clearStoredToken();
    clearAppliedToken();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      register,
      logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

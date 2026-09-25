import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '../types';

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
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
    if (!savedToken) return;

    setToken(savedToken);
    applyToken(savedToken);
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    try {
      const response = await axios.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
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
    try {
      const response = await axios.post('/api/auth/register', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        termsAccepted,
      });

      setToken(null);
      setUser(null);
      clearStoredToken();
      delete axios.defaults.headers.common['Authorization'];

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
    setUser(null);
    setToken(null);
    clearStoredToken();
    delete axios.defaults.headers.common['Authorization'];
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

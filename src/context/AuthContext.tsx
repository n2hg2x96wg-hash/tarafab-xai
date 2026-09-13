import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (fullName: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) return;

    setToken(savedToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    try {
      const response = await axios.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
      });

      setToken(response.data.token);
      setUser(response.data.user);
      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    } catch (error: any) {
      const code = error.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        throw new Error('Please verify your email before signing in.');
      }
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string, confirmPassword: string) => {
    try {
      const response = await axios.post('/api/auth/register', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        termsAccepted: true,
      });

      // New accounts are verified before a session is established.
      setToken(null);
      setUser(null);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];

      if (response.data.verificationToken) {
        // Development-only verification support; production delivery is handled by email infrastructure.
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
    localStorage.removeItem('token');
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

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface AppSettingsContextValue {
  theme: Theme;
  toggleTheme: () => void;
  currency: string;
  setCurrency: (currency: string) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

const THEME_KEY = 'tarafab-xai-theme';
const CURRENCY_KEY = 'tarafab-xai-currency';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialCurrency(): string {
  if (typeof window === 'undefined') return 'USD';
  return window.localStorage.getItem(CURRENCY_KEY) ?? 'USD';
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [currency, setCurrencyState] = useState<string>(getInitialCurrency);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(CURRENCY_KEY, currency);
  }, [currency]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      currency,
      setCurrency: setCurrencyState,
    }),
    [theme, currency],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}

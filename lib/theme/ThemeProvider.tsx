'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { THEME_COOKIE, THEME_STORAGE_KEY, isThemePreference, type ResolvedTheme, type ThemePreference } from './config'
export type { ResolvedTheme, ThemePreference } from './config'

type Ctx = { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (p: ThemePreference) => void }
const ThemeContext = createContext<Ctx | null>(null)

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(resolved: ResolvedTheme, animate: boolean) {
  const root = document.documentElement
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 250)
  }
  root.setAttribute('data-theme', resolved)
}

// Personal preference per browser: an admin choosing light never changes
// what any client sees.
export function ThemeProvider({ initialPreference, children }: { initialPreference: ThemePreference; children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(initialPreference)
  const [resolved, setResolved] = useState<ResolvedTheme>(initialPreference === 'light' ? 'light' : 'dark')

  // Adopt what the head script applied (it may know a localStorage value the
  // server did not).
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(THEME_STORAGE_KEY) } catch { /* private mode */ }
    if (isThemePreference(saved)) setPref(saved)
    const current = document.documentElement.getAttribute('data-theme')
    if (current === 'light' || current === 'dark') setResolved(current)
  }, [])

  // Follow the device while on "system".
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => { const r = systemTheme(); setResolved(r); apply(r, true) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  // Another tab changed the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !isThemePreference(e.newValue)) return
      setPref(e.newValue)
      const r = e.newValue === 'system' ? systemTheme() : e.newValue
      setResolved(r); apply(r, true)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p)
    const r = p === 'system' ? systemTheme() : p
    setResolved(r)
    apply(r, true)
    try { localStorage.setItem(THEME_STORAGE_KEY, p) } catch { /* private mode */ }
    document.cookie = `${THEME_COOKIE}=${p}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

const fallback: Ctx = { preference: 'dark', resolved: 'dark', setPreference: () => {} }
export function useTheme() {
  return useContext(ThemeContext) ?? fallback
}

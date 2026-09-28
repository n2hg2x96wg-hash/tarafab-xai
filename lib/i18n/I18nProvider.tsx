'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, type Locale } from './config'
import { dictionaries, en, type Dictionary } from './dictionaries'
import type { Paths } from './types'

export type TKey = Paths<Dictionary>
type Vars = Record<string, string | number>

const STORAGE_KEY = 'tarafab.lang'

function lookup(dict: unknown, key: string): string | undefined {
  let node = dict
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' && node.trim() !== '' ? node : undefined
}

// Selected language, falling back to English per string, never to a key,
// "undefined" or an empty label.
export function translate(locale: Locale, key: TKey, vars?: Vars) {
  const raw = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? ''
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw
}

type Ctx = { locale: Locale; intl: string; setLocale: (l: Locale) => void; t: (key: TKey, vars?: Vars) => string }
const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  // A choice saved in this browser wins if the cookie was cleared.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (isLocale(saved) && saved !== locale) setLocaleState(saved)
    } catch { /* storage unavailable: keep the cookie value */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // Another tab changed the language.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY && isLocale(e.newValue)) setLocaleState(e.newValue) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* private mode */ }
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo<Ctx>(() => ({
    locale,
    intl: LOCALES.find(l => l.code === locale)?.intl ?? 'en-US',
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
  }), [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

const fallback: Ctx = {
  locale: DEFAULT_LOCALE,
  intl: 'en-US',
  setLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
}

export function useI18n() {
  return useContext(I18nContext) ?? fallback
}

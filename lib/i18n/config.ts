// Supported languages. To add one: create locales/<code>.ts (any keys it
// omits fall back to English), import it in dictionaries.ts, and add it here.
export const LOCALES = [
  { code: 'en', name: 'English', label: 'EN', intl: 'en-US' },
  { code: 'fr', name: 'Français', label: 'FR', intl: 'fr-FR' },
  { code: 'es', name: 'Español', label: 'ES', intl: 'es-ES' },
  { code: 'de', name: 'Deutsch', label: 'DE', intl: 'de-DE' },
  { code: 'pt', name: 'Português', label: 'PT', intl: 'pt-PT' },
  { code: 'it', name: 'Italiano', label: 'IT', intl: 'it-IT' },
] as const

export type Locale = (typeof LOCALES)[number]['code']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'tarafab_lang'

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && LOCALES.some(l => l.code === v)
}

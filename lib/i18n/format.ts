import type { TKey } from './I18nProvider'

type T = (key: TKey, vars?: Record<string, string | number>) => string

// Relative time in the selected language.
export function timeAgoT(t: T, ms: number | null, now = Date.now()) {
  if (!ms) return ''
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 10) return t('common.justNow')
  if (s < 60) return t('common.secondsAgo', { n: s })
  if (s < 3600) return t('common.minutesAgo', { n: Math.floor(s / 60) })
  return t('common.hoursAgo', { n: Math.floor(s / 3600) })
}

// Labels for stored status values; the stored value itself never changes.
// Unknown values fall back to a readable form of the raw value.
export function statusLabel(t: T, status: string) {
  const key = `status.${status}` as TKey
  return t(key) || status.replace(/_/g, ' ')
}

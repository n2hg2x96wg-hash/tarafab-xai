// Phone numbers for client profiles (administrative contact only: no SMS, no
// one-time codes, no phone sign-in, never marked as verified).
//
// The same rules run in the browser and on the server: the number must be a
// possible number for the chosen country (length and format, per the
// libphonenumber metadata), and it is stored in E.164 form (+2348031234567)
// with the ISO country code. A national number typed with its trunk prefix
// ("0803 123 4567") is normalised correctly for each country.
import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'

export type PhoneResult =
  | { ok: true; e164: string; country: string; display: string }
  | { ok: false; error: 'missing' | 'country' | 'invalid' }

export function callingCode(iso: string): string | null {
  return iso && isSupportedCountry(iso as CountryCode) ? `+${getCountryCallingCode(iso as CountryCode)}` : null
}

export function normalizePhone(input: string, iso: string): PhoneResult {
  const raw = String(input || '').replace(/[^\d+()\-.\s]/g, '').trim()
  if (!raw.replace(/\D/g, '')) return { ok: false, error: 'missing' }
  const international = raw.startsWith('+')
  if (!international && !callingCode(iso)) return { ok: false, error: 'country' }
  const parsed = parsePhoneNumberFromString(raw, international ? undefined : iso as CountryCode)
  if (!parsed || !parsed.isPossible()) return { ok: false, error: 'invalid' }
  const e164 = parsed.number
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { ok: false, error: 'invalid' }
  // Countries that share a calling code (+1, +44, +7…) cannot be told apart
  // from the number alone, so the country the person chose wins when it fits.
  const country = callingCode(iso) === `+${parsed.countryCallingCode}` ? iso : parsed.country || ''
  if (!country) return { ok: false, error: 'country' }
  return { ok: true, e164, country, display: parsed.formatInternational() }
}

// Readable form for screens: "+234 803 123 4567". Falls back to the stored text.
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const p = parsePhoneNumberFromString(e164)
  return p ? p.formatInternational() : e164
}

// The country to preselect: the region in the browser language (en-NG → NG).
export function guessCountry(): string {
  if (typeof navigator === 'undefined') return ''
  for (const tag of [navigator.language, ...(navigator.languages || [])]) {
    const region = /[-_]([A-Z]{2})$/i.exec(tag || '')?.[1]?.toUpperCase()
    if (region && callingCode(region)) return region
  }
  return ''
}

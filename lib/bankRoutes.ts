// Bank-transfer destinations: which countries are supported, which fields
// each country's route needs, and how they are checked. The database
// (_bank_route_for / _bank_normalize) applies the same rules and is the
// authority; these copies let the form show the right fields and point at
// the field that is wrong before anything is sent.
//
// Only identifiers a bank publishes for receiving money are collected. Never
// a PIN, online-banking password, card number, CVV or one-time code.

export type BankRoute = 'us_ach' | 'gb_fps' | 'ca_eft' | 'au_bsb' | 'sepa'

export type BankField = {
  key: string
  label: string
  placeholder?: string
  help?: string
  inputMode?: 'numeric' | 'text'
  options?: { value: string; label: string }[]
  optional?: boolean
  maxLength: number
}

export type BankCountry = { code: string; name: string; route: BankRoute; currency: string; ibanLength?: number }

const SEPA: [string, string, number][] = [
  ['AT', 'Austria', 20], ['BE', 'Belgium', 16], ['BG', 'Bulgaria', 22], ['HR', 'Croatia', 21], ['CY', 'Cyprus', 28],
  ['EE', 'Estonia', 20], ['FI', 'Finland', 18], ['FR', 'France', 27], ['DE', 'Germany', 22], ['GR', 'Greece', 27],
  ['IE', 'Ireland', 22], ['IT', 'Italy', 27], ['LV', 'Latvia', 21], ['LT', 'Lithuania', 20], ['LU', 'Luxembourg', 20],
  ['MT', 'Malta', 31], ['NL', 'Netherlands', 18], ['PT', 'Portugal', 25], ['SK', 'Slovakia', 24], ['SI', 'Slovenia', 19],
  ['ES', 'Spain', 24],
]

export const BANK_COUNTRIES: BankCountry[] = ([
  { code: 'AU', name: 'Australia', route: 'au_bsb', currency: 'AUD' },
  { code: 'CA', name: 'Canada', route: 'ca_eft', currency: 'CAD' },
  { code: 'GB', name: 'United Kingdom', route: 'gb_fps', currency: 'GBP' },
  { code: 'US', name: 'United States', route: 'us_ach', currency: 'USD' },
  ...SEPA.map(([code, name, ibanLength]): BankCountry => ({ code, name, route: 'sepa', currency: 'EUR', ibanLength })),
] satisfies BankCountry[] as BankCountry[]).sort((a, b) => a.name.localeCompare(b.name))

export const ROUTE_NAMES: Record<BankRoute, string> = {
  us_ach: 'US domestic transfer (ACH)',
  gb_fps: 'UK Faster Payments',
  ca_eft: 'Canadian bank transfer (EFT)',
  au_bsb: 'Australian bank transfer',
  sepa: 'SEPA transfer (euro)',
}

export function bankCountry(code: string | null | undefined) {
  return BANK_COUNTRIES.find(c => c.code === (code || '').toUpperCase())
}

export function countryName(code: string) {
  return bankCountry(code)?.name || code
}

export function routeFields(c: BankCountry): BankField[] {
  switch (c.route) {
    case 'us_ach': return [
      { key: 'routing_number', label: 'Routing number (ABA)', placeholder: '9 digits, e.g. 021000021', inputMode: 'numeric', maxLength: 11, help: 'The 9-digit number at the bottom left of a check, or in your bank app.' },
      { key: 'account_number', label: 'Account number', placeholder: '4 to 17 digits', inputMode: 'numeric', maxLength: 20 },
      { key: 'account_type', label: 'Account type', options: [{ value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' }], maxLength: 10 },
    ]
    case 'gb_fps': return [
      { key: 'sort_code', label: 'Sort code', placeholder: '12-34-56', inputMode: 'numeric', maxLength: 8 },
      { key: 'account_number', label: 'Account number', placeholder: '8 digits', inputMode: 'numeric', maxLength: 10 },
    ]
    case 'ca_eft': return [
      { key: 'institution_number', label: 'Institution number', placeholder: '3 digits, e.g. 003', inputMode: 'numeric', maxLength: 3 },
      { key: 'transit_number', label: 'Transit (branch) number', placeholder: '5 digits', inputMode: 'numeric', maxLength: 5 },
      { key: 'account_number', label: 'Account number', placeholder: '7 to 12 digits', inputMode: 'numeric', maxLength: 14 },
    ]
    case 'au_bsb': return [
      { key: 'bsb', label: 'BSB', placeholder: '062-000', inputMode: 'numeric', maxLength: 7 },
      { key: 'account_number', label: 'Account number', placeholder: '5 to 9 digits', inputMode: 'numeric', maxLength: 11 },
    ]
    case 'sepa': return [
      { key: 'iban', label: 'IBAN', placeholder: `${c.code}… (${c.ibanLength} characters)`, maxLength: 42, help: `Starts with ${c.code}. Spaces are fine.` },
      { key: 'bic', label: 'BIC / SWIFT code', placeholder: '8 or 11 characters', optional: true, maxLength: 11 },
    ]
  }
}

const digits = (v: string) => v.replace(/[\s-]/g, '')

export function abaValid(v: string) {
  if (!/^\d{9}$/.test(v)) return false
  const d = v.split('').map(Number)
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0
}

export function ibanValid(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const s = iban.slice(4) + iban.slice(0, 4)
  let rem = 0
  for (const ch of s) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

// Field-level errors (key → message); empty when every field is valid.
export function validateBankDetails(c: BankCountry, v: Record<string, string>): Record<string, string> {
  const e: Record<string, string> = {}
  const acct = digits(v.account_number || '')
  switch (c.route) {
    case 'us_ach':
      if (!abaValid(digits(v.routing_number || ''))) e.routing_number = 'Enter a valid 9-digit ABA routing number.'
      if (!/^\d{4,17}$/.test(acct)) e.account_number = 'Enter a valid account number (4 to 17 digits).'
      if (!['checking', 'savings'].includes(v.account_type || '')) e.account_type = 'Choose checking or savings.'
      break
    case 'gb_fps':
      if (!/^\d{6}$/.test(digits(v.sort_code || ''))) e.sort_code = 'Enter a valid 6-digit sort code.'
      if (!/^\d{8}$/.test(acct)) e.account_number = 'Enter a valid 8-digit account number.'
      break
    case 'ca_eft':
      if (!/^\d{3}$/.test(digits(v.institution_number || ''))) e.institution_number = 'Enter a valid 3-digit institution number.'
      if (!/^\d{5}$/.test(digits(v.transit_number || ''))) e.transit_number = 'Enter a valid 5-digit transit number.'
      if (!/^\d{7,12}$/.test(acct)) e.account_number = 'Enter a valid account number (7 to 12 digits).'
      break
    case 'au_bsb':
      if (!/^\d{6}$/.test(digits(v.bsb || ''))) e.bsb = 'Enter a valid 6-digit BSB.'
      if (!/^\d{5,9}$/.test(acct)) e.account_number = 'Enter a valid account number (5 to 9 digits).'
      break
    case 'sepa': {
      const iban = (v.iban || '').replace(/\s/g, '').toUpperCase()
      if (iban.slice(0, 2) !== c.code) e.iban = `The IBAN must start with ${c.code} for a bank account in this country.`
      else if (iban.length !== c.ibanLength || !ibanValid(iban)) e.iban = 'Enter a valid IBAN.'
      const bic = (v.bic || '').replace(/\s/g, '').toUpperCase()
      if (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) e.bic = 'Enter a valid BIC / SWIFT code (8 or 11 characters), or leave it empty.'
      else if (bic && bic.slice(4, 6) !== c.code) e.bic = 'The BIC / SWIFT code must be for a bank in this country.'
      break
    }
  }
  return e
}

// Only the keys the country's route uses are sent; anything else is dropped.
export function pickDetails(c: BankCountry, v: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of routeFields(c)) {
    const raw = v[f.key]
    if (typeof raw === 'string' && raw.trim()) out[f.key] = raw.trim().slice(0, 64)
  }
  return out
}

export type SavedBankAccount = {
  id: string
  label: string | null
  country: string
  currency: string
  route: BankRoute
  holder_name: string
  bank_name: string
  account_last4: string
  name_check: 'match' | 'mismatch'
  status: 'pending_review' | 'verified' | 'rejected'
  review_note: string | null
  created_at: string
  updated_at: string
}

export type BankContext = { enabled: boolean; mode: string; routes: BankRoute[]; kyc_verified: boolean; legal_name: string | null }

export const BANK_STATUS_TEXT: Record<SavedBankAccount['status'], string> = {
  pending_review: 'Awaiting verification',
  verified: 'Verified destination',
  rejected: 'Not accepted',
}

export function bankTitle(a: Pick<SavedBankAccount, 'label' | 'bank_name'>) {
  return a.label || a.bank_name
}

export function bankMasked(a: Pick<SavedBankAccount, 'account_last4'>) {
  return `Bank account ending in •••• ${a.account_last4}`
}

// Every country and territory a bank account can be held in, with its
// currencies, from the maintained `countries-list` package (ISO 3166-1
// codes, ISO 4217 currencies). This catalog only lists countries: whether
// Tarafab.XAi can actually pay a bank withdrawal there is decided separately
// by lib/bankRoutes (BANK_COUNTRIES) and, authoritatively, by the database
// (_bank_route_for and the enabled routes in system_settings).
//
// Loaded on demand by the bank-account form (dynamic import), so the data is
// not part of the dashboard's main bundle.
import { countries } from 'countries-list'
import { BANK_COUNTRIES, type BankCountry } from '@/lib/bankRoutes'

export type CatalogCountry = {
  code: string
  name: string
  native: string
  currencies: string[]
  // Set when bank withdrawals to this country are offered (route + currency).
  payout?: BankCountry
}

// ISO 4217 fund and settlement codes (not currencies people hold in a bank
// account), which the data source lists next to the real currency.
const FUND_CODES = new Set(['BOV', 'CHE', 'CHW', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW', 'XSU', 'XUA'])

// Places with no permanent population and so no resident bank accounts.
const UNINHABITED = new Set(['AQ', 'BV', 'GS', 'HM', 'IO', 'TF', 'UM'])

// Other names people search for.
const ALIASES: Record<string, string[]> = {
  GB: ['UK', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Britain'],
  US: ['USA', 'United States of America', 'America'],
  AE: ['UAE', 'Emirates', 'Dubai', 'Abu Dhabi'],
  NL: ['Holland'],
  CI: ["Cote d'Ivoire"],
  CZ: ['Czech Republic'],
  TR: ['Turkey'],
  MM: ['Burma'],
  SZ: ['Swaziland'],
  MK: ['Macedonia'],
  KR: ['Korea', 'Republic of Korea'],
  KP: ['Korea', 'DPRK'],
  CD: ['DRC', 'Congo-Kinshasa', 'Congo'],
  CG: ['Congo-Brazzaville', 'Congo'],
  CV: ['Cabo Verde'],
  TL: ['East Timor'],
  VA: ['Holy See'],
  PS: ['Palestinian Territories'],
  RU: ['Russian Federation'],
  IR: ['Persia'],
  LA: ["Lao People's Democratic Republic"],
  VN: ['Viet Nam'],
  BO: ['Plurinational State of Bolivia'],
  VE: ['Bolivarian Republic of Venezuela'],
  TZ: ['United Republic of Tanzania'],
  SY: ['Syrian Arab Republic'],
}

// Accents, apostrophes and dots are ignored and hyphens count as spaces, so
// "cote divoire" finds Côte d'Ivoire.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`.]/g, '').replace(/-/g, ' ').toLowerCase()

let cache: { list: CatalogCountry[]; search: Map<string, string> } | null = null

function build() {
  if (cache) return cache
  const payout = new Map(BANK_COUNTRIES.map(c => [c.code, c]))
  const list: CatalogCountry[] = []
  const search = new Map<string, string>()
  for (const [code, c] of Object.entries(countries) as [string, { name: string; native: string; currency: string[] }][]) {
    if (UNINHABITED.has(code)) continue
    const currencies = Array.from(new Set(c.currency.filter(x => /^[A-Z]{3}$/.test(x) && !FUND_CODES.has(x))))
    if (!currencies.length) continue
    const route = payout.get(code)
    // A payout route pays in one currency; it must be one the country uses.
    const p = route && currencies.includes(route.currency) ? route : undefined
    list.push({ code, name: c.name, native: c.native, currencies, payout: p })
    search.set(code, fold([c.name, c.native, code, ...(ALIASES[code] || [])].join(' | ')))
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  cache = { list, search }
  return cache
}

export function allCountries(): CatalogCountry[] {
  return build().list
}

export function findCountry(code: string | null | undefined): CatalogCountry | undefined {
  const c = (code || '').toUpperCase()
  return build().list.find(x => x.code === c)
}

// Countries whose name (English or local), ISO code or a common other name
// contains every word typed, accents ignored. Names that start with the query
// come first.
export function searchCountries(query: string): CatalogCountry[] {
  const { list, search } = build()
  const q = fold(query.trim())
  if (!q) return list
  const words = q.split(/\s+/)
  const hits = list.filter(c => {
    const hay = search.get(c.code) || ''
    return words.every(w => hay.includes(w)) || c.currencies.some(cur => cur.toLowerCase() === q)
  })
  const starts = (c: CatalogCountry) => fold(c.name).startsWith(q) || c.code.toLowerCase() === q
  return [...hits.filter(starts), ...hits.filter(c => !starts(c))]
}

// "Nigeria · NGN"; several currencies are listed, a long list is shortened.
export function currencyText(c: Pick<CatalogCountry, 'currencies'>) {
  const cur = c.currencies
  return cur.length > 3 ? `${cur.slice(0, 3).join(', ')} +${cur.length - 3}` : cur.join(', ')
}

export function countryLabel(c: Pick<CatalogCountry, 'name' | 'currencies'>) {
  return `${c.name} · ${currencyText(c)}`
}

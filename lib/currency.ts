// Display currencies (prices are billed in NGN; these are for display only).
// One maintainable table: add a currency here and enable it in Admin →
// Premium → Currency display. Country → currency follows ISO 4217.
export const CURRENCIES: Record<string, string> = {
  NGN: 'Nigerian naira', USD: 'US dollar', GBP: 'British pound', EUR: 'Euro', CAD: 'Canadian dollar', AUD: 'Australian dollar',
  PHP: 'Philippine peso', GHS: 'Ghanaian cedi', KES: 'Kenyan shilling', ZAR: 'South African rand', INR: 'Indian rupee', AED: 'UAE dirham',
  JPY: 'Japanese yen', CNY: 'Chinese yuan', CHF: 'Swiss franc', SEK: 'Swedish krona', NOK: 'Norwegian krone', DKK: 'Danish krone',
  NZD: 'New Zealand dollar', SGD: 'Singapore dollar', BRL: 'Brazilian real', MXN: 'Mexican peso', EGP: 'Egyptian pound', SAR: 'Saudi riyal',
  XOF: 'West African CFA franc', XAF: 'Central African CFA franc', UGX: 'Ugandan shilling', TZS: 'Tanzanian shilling', RWF: 'Rwandan franc',
}
const EUROZONE = ['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK']
const XOF = ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'], XAF = ['CM', 'CF', 'TD', 'CG', 'GQ', 'GA']
export const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', PH: 'PHP', GH: 'GHS', KE: 'KES', ZA: 'ZAR', IN: 'INR', AE: 'AED',
  JP: 'JPY', CN: 'CNY', CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', NZ: 'NZD', SG: 'SGD', BR: 'BRL', MX: 'MXN', EG: 'EGP', SA: 'SAR',
  UG: 'UGX', TZ: 'TZS', RW: 'RWF', PR: 'USD', EC: 'USD', SV: 'USD', PA: 'USD',
  ...Object.fromEntries(EUROZONE.map(c => [c, 'EUR'])), ...Object.fromEntries(XOF.map(c => [c, 'XOF'])), ...Object.fromEntries(XAF.map(c => [c, 'XAF'])),
}
export const isCurrency = (c: unknown): c is string => typeof c === 'string' && /^[A-Z]{3}$/.test(c) && c in CURRENCIES
export type CurrencyConfig = { auto_detect: boolean; fallback: string; enabled: string[] }
export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = { auto_detect: true, fallback: 'USD', enabled: ['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'PHP', 'GHS', 'KES', 'ZAR', 'INR', 'AED'] }
export function parseCurrencyConfig(v: unknown): CurrencyConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<CurrencyConfig>
  const enabled = Array.isArray(o.enabled) ? o.enabled.filter(isCurrency) : DEFAULT_CURRENCY_CONFIG.enabled
  if (!enabled.includes('NGN')) enabled.unshift('NGN')
  const fallback = isCurrency(o.fallback) && enabled.includes(o.fallback) ? o.fallback : enabled.includes('USD') ? 'USD' : 'NGN'
  return { auto_detect: o.auto_detect !== false, fallback, enabled }
}
// Display currency for a country under the admin's settings.
export function currencyForCountry(country: string | null, cfg: CurrencyConfig) {
  const c = country ? COUNTRY_CURRENCY[country] : undefined
  return cfg.auto_detect && c && cfg.enabled.includes(c) ? c : cfg.fallback
}

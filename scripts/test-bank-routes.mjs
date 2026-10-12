// Bank-destination field rules (lib/bankRoutes.ts), which mirror the
// database's _bank_route_for / _bank_normalize. No network, no build.
// Run: npm run test:bank   (Node 22+, uses --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { BANK_COUNTRIES, bankCountry, routeFields, validateBankDetails, pickDetails, abaValid, ibanValid } = await import('../lib/bankRoutes.ts')

test('supported countries and their routes', () => {
  assert.equal(bankCountry('gb').route, 'gb_fps')
  assert.equal(bankCountry('US').currency, 'USD')
  assert.equal(bankCountry('DE').ibanLength, 22)
  assert.equal(bankCountry('NG'), undefined)
  assert.equal(bankCountry(''), undefined)
  assert.equal(BANK_COUNTRIES.length, 25)
  assert.ok(BANK_COUNTRIES.every(c => c.route !== 'sepa' || (c.currency === 'EUR' && c.ibanLength >= 15)))
})

test('each country shows only its own fields', () => {
  const keys = code => routeFields(bankCountry(code)).map(f => f.key)
  assert.deepEqual(keys('US'), ['routing_number', 'account_number', 'account_type'])
  assert.deepEqual(keys('GB'), ['sort_code', 'account_number'])
  assert.deepEqual(keys('CA'), ['institution_number', 'transit_number', 'account_number'])
  assert.deepEqual(keys('AU'), ['bsb', 'account_number'])
  assert.deepEqual(keys('FR'), ['iban', 'bic'])
  // Never asks for secrets.
  const all = BANK_COUNTRIES.flatMap(c => routeFields(c).map(f => `${f.key} ${f.label}`.toLowerCase()))
  assert.ok(!all.some(s => /pin|password|cvv|otp|one-time|card/.test(s)))
})

test('checksums', () => {
  assert.ok(abaValid('021000021'))
  assert.ok(!abaValid('021000022'))
  assert.ok(!abaValid('12345678'))
  assert.ok(ibanValid('DE89370400440532013000'))
  assert.ok(ibanValid('GB82WEST12345698765432'))
  assert.ok(!ibanValid('DE89370400440532013001'))
})

test('valid details pass, with spaces and dashes', () => {
  assert.deepEqual(validateBankDetails(bankCountry('US'), { routing_number: '021-000-021', account_number: '1234 5678 9', account_type: 'checking' }), {})
  assert.deepEqual(validateBankDetails(bankCountry('GB'), { sort_code: '20-00-00', account_number: '5577 9911' }), {})
  assert.deepEqual(validateBankDetails(bankCountry('CA'), { institution_number: '003', transit_number: '12345', account_number: '1234567' }), {})
  assert.deepEqual(validateBankDetails(bankCountry('AU'), { bsb: '062-000', account_number: '12345678' }), {})
  assert.deepEqual(validateBankDetails(bankCountry('DE'), { iban: 'de89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX' }), {})
  assert.deepEqual(validateBankDetails(bankCountry('DE'), { iban: 'DE89370400440532013000' }), {})
})

test('invalid details are reported on the right field', () => {
  assert.deepEqual(Object.keys(validateBankDetails(bankCountry('US'), { routing_number: '021000022', account_number: '12', account_type: '' })).sort(), ['account_number', 'account_type', 'routing_number'])
  assert.deepEqual(Object.keys(validateBankDetails(bankCountry('GB'), { sort_code: '1234', account_number: '5577991' })).sort(), ['account_number', 'sort_code'])
  assert.match(validateBankDetails(bankCountry('FR'), { iban: 'DE89370400440532013000' }).iban, /must start with FR/)
  assert.equal(validateBankDetails(bankCountry('DE'), { iban: 'DE89370400440532013001' }).iban, 'Enter a valid IBAN.')
  assert.match(validateBankDetails(bankCountry('DE'), { iban: 'DE89370400440532013000', bic: 'BNPAFRPP' }).bic, /bank in this country/)
  assert.match(validateBankDetails(bankCountry('DE'), { iban: 'DE89370400440532013000', bic: 'XX' }).bic, /8 or 11/)
})

test('only the route\'s own keys are sent', () => {
  assert.deepEqual(pickDetails(bankCountry('GB'), { sort_code: ' 200000 ', account_number: '55779911', pin: '1234', iban: 'x', cvv: 1 }), { sort_code: '200000', account_number: '55779911' })
})

// ---- Country catalog (lib/countryCatalog.ts, data from countries-list) ----
const CAT = await import('../lib/countryCatalog.ts')

test('catalog: requested countries with their currencies', () => {
  const want = { NG: 'NGN', PH: 'PHP', GH: 'GHS', KE: 'KES', ZA: 'ZAR', IN: 'INR', PK: 'PKR', BD: 'BDT', EG: 'EGP', AE: 'AED', SA: 'SAR', SG: 'SGD', MY: 'MYR', ID: 'IDR', JP: 'JPY', NZ: 'NZD', CH: 'CHF', BR: 'BRL', MX: 'MXN', TH: 'THB' }
  for (const [code, cur] of Object.entries(want)) {
    const c = CAT.findCountry(code)
    assert.ok(c, code)
    assert.deepEqual(c.currencies, [cur], code)
  }
  assert.equal(CAT.countryLabel(CAT.findCountry('NG')), 'Nigeria · NGN')
  assert.equal(CAT.countryLabel(CAT.findCountry('PH')), 'Philippines · PHP')
})

test('catalog: comprehensive, no duplicates, no fund codes, no uninhabited places', () => {
  const all = CAT.allCountries()
  assert.ok(all.length >= 240, String(all.length))
  assert.equal(new Set(all.map(c => c.code)).size, all.length)
  assert.equal(new Set(all.map(c => c.name)).size, all.length)
  const codes = all.flatMap(c => c.currencies)
  for (const f of ['CHE', 'CHW', 'USN', 'BOV', 'CLF', 'UYI']) assert.ok(!codes.includes(f), f)
  for (const u of ['AQ', 'BV', 'HM']) assert.equal(CAT.findCountry(u), undefined, u)
  assert.ok(all.every(c => c.currencies.length && c.currencies.every(x => /^[A-Z]{3}$/.test(x))))
  // Sorted by name.
  assert.deepEqual(all.map(c => c.name), [...all.map(c => c.name)].sort((a, b) => a.localeCompare(b, 'en')))
})

test('catalog: several currencies are kept and shown', () => {
  assert.deepEqual(CAT.findCountry('PA').currencies, ['PAB', 'USD'])
  assert.equal(CAT.countryLabel(CAT.findCountry('PA')), 'Panama · PAB, USD')
  assert.deepEqual(CAT.findCountry('CH').currencies, ['CHF'])
  assert.deepEqual(CAT.findCountry('US').currencies, ['USD'])
  assert.match(CAT.currencyText(CAT.findCountry('ZW')), /^ZWG, USD, ZAR \+\d+$/)
})

test('catalog: every previously offered country is still listed, with its payout route', () => {
  for (const b of BANK_COUNTRIES) {
    const c = CAT.findCountry(b.code)
    assert.ok(c, b.code)
    assert.equal(c.payout?.route, b.route, b.code)
    assert.ok(c.currencies.includes(b.currency), b.code)
  }
  // Listing a country does not make it payable.
  assert.equal(CAT.allCountries().filter(c => c.payout).length, BANK_COUNTRIES.length)
  for (const code of ['NG', 'PH', 'IN', 'JP']) assert.equal(CAT.findCountry(code).payout, undefined, code)
})

test('catalog: search by name, local name, other names, code and currency', () => {
  const first = q => CAT.searchCountries(q)[0]?.code
  assert.equal(first('Nigeria'), 'NG')
  assert.ok(CAT.searchCountries('nig').map(c => c.code).includes('NG'))
  assert.equal(first('philip'), 'PH')
  assert.equal(first('Pilipinas'), 'PH')
  assert.equal(first('uae'), 'AE')
  assert.equal(first('cote divoire'), 'CI')
  assert.equal(first('curacao'), 'CW')
  assert.equal(first('Deutschland'), 'DE')
  assert.equal(first('NGN'), 'NG')
  assert.equal(first('united kingdom'), 'GB')
  assert.deepEqual(CAT.searchCountries('zzzz'), [])
  assert.equal(CAT.searchCountries('').length, CAT.allCountries().length)
})

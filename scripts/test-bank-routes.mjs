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

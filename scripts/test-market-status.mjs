// Market freshness rule and summary provider fallbacks (no network, no build).
// Run: npm run test:market   (Node 22+, uses --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { effectiveState, feedStatus, quoteAgeMs, ageLabel, staleAfterMs, STALE_AFTER_MS, DEFAULT_STALE_AFTER_SEC } = await import('../lib/marketStatus.ts')

const NOW = Date.parse('2026-10-11T12:00:00Z')
const at = sec => new Date(NOW - sec * 1000).toISOString()
const q = (extra = {}) => ({ price: 83050.39, state: 'live', updatedAt: at(20), market: '24/7', checkedAt: at(20), ...extra })

test('threshold: default 180 s, configurable within 60–900 s, bad values ignored', () => {
  assert.equal(DEFAULT_STALE_AFTER_SEC, 180)
  assert.equal(STALE_AFTER_MS, 180_000)
  assert.equal(staleAfterMs(undefined), 180_000)
  assert.equal(staleAfterMs(''), 180_000)
  assert.equal(staleAfterMs('300'), 300_000)
  assert.equal(staleAfterMs('59'), 180_000)
  assert.equal(staleAfterMs('901'), 180_000)
  assert.equal(staleAfterMs('abc'), 180_000)
})

test('fresh live quote is live', () => {
  assert.equal(effectiveState(q(), false, NOW), 'live')
  assert.equal(effectiveState(q({ updatedAt: at(179) }), false, NOW), 'live')
})

test('fresh delayed quote stays delayed (never promoted to live)', () => {
  assert.equal(effectiveState(q({ state: 'delayed' }), false, NOW), 'delayed')
})

test('expired quote is stale', () => {
  assert.equal(effectiveState(q({ updatedAt: at(181) }), false, NOW), 'stale')
  // The reported case: a 4-hour-old snapshot still marked live by the server.
  assert.equal(effectiveState(q({ updatedAt: at(4 * 3600) }), false, NOW), 'stale')
})

test('custom threshold applies', () => {
  assert.equal(effectiveState(q({ updatedAt: at(240) }), false, NOW, 300_000), 'live')
  assert.equal(effectiveState(q({ updatedAt: at(240) }), false, NOW, 120_000), 'stale')
})

test('missing or unreadable timestamp is never live', () => {
  assert.equal(effectiveState(q({ updatedAt: null }), false, NOW), 'stale')
  assert.equal(effectiveState(q({ updatedAt: undefined }), false, NOW), 'stale')
  assert.equal(effectiveState(q({ updatedAt: 'not a date' }), false, NOW), 'stale')
})

test('timestamp far in the future is invalid; small clock skew is tolerated', () => {
  assert.equal(effectiveState(q({ updatedAt: at(-3600) }), false, NOW), 'stale')
  assert.equal(effectiveState(q({ updatedAt: at(-30) }), false, NOW), 'live')
})

test('failed provider / failed refresh: shown quote is stale, missing quote unavailable', () => {
  assert.equal(effectiveState(q(), true, NOW), 'stale')
  assert.equal(effectiveState(q({ price: null, state: 'unavailable' }), false, NOW), 'unavailable')
  assert.equal(effectiveState(q({ state: 'error' }), false, NOW), 'unavailable')
  assert.equal(effectiveState(q({ price: Number.NaN }), false, NOW), 'unavailable')
})

test('stale cached quote stays stale even with a fresh-looking timestamp', () => {
  assert.equal(effectiveState(q({ state: 'stale' }), false, NOW), 'stale')
})

test('recovery: a fresh quote after a failure is live again', () => {
  const before = effectiveState(q({ updatedAt: at(4 * 3600) }), true, NOW)
  const after = effectiveState(q({ updatedAt: at(5) }), false, NOW)
  assert.deepEqual([before, after], ['stale', 'live'])
})

test('closed market: last close is delayed while re-checked, stale once checks stop', () => {
  const close = { market: 'closed', state: 'delayed', updatedAt: at(2 * 86400) }
  assert.equal(effectiveState(q({ ...close, checkedAt: at(30) }), false, NOW), 'delayed')
  assert.equal(effectiveState(q({ ...close, state: 'live', checkedAt: at(30) }), false, NOW), 'delayed')
  assert.equal(effectiveState(q({ ...close, checkedAt: at(600) }), false, NOW), 'stale')
  assert.equal(effectiveState(q({ ...close, checkedAt: null }), false, NOW), 'stale')
})

test('conflicting components: the same quote gets the same label everywhere', () => {
  // Hero, ticker and board all evaluate the one shared snapshot; the label
  // depends only on (quote, refresh result, clock), so they cannot disagree.
  const snap = q({ updatedAt: at(4 * 3600) })
  const labels = ['hero', 'ticker', 'board'].map(() => effectiveState(snap, false, NOW))
  assert.deepEqual(new Set(labels), new Set(['stale']))
})

test('feed status: live only with a live quote', () => {
  assert.equal(feedStatus([q(), q({ updatedAt: at(4 * 3600) })], false, NOW), 'live')
  assert.equal(feedStatus([q({ updatedAt: at(4 * 3600) })], false, NOW), 'connecting')
  assert.equal(feedStatus([q({ price: null, state: 'unavailable' })], false, NOW), 'error')
  assert.equal(feedStatus(null, true, NOW), 'error')
  assert.equal(feedStatus(null, false, NOW), 'connecting')
})

test('age helpers', () => {
  assert.equal(quoteAgeMs(at(90), NOW), 90_000)
  assert.equal(quoteAgeMs(null, NOW), null)
  assert.equal(ageLabel(at(20), NOW), '<1m')
  assert.equal(ageLabel(at(4 * 60), NOW), '4m')
  assert.equal(ageLabel(at(4 * 3600), NOW), '4h')
  assert.equal(ageLabel(null, NOW), '')
})

// ---- server summary: no fabricated timestamps; fallbacks keep the real time
const realFetch = globalThis.fetch
const reply = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => body })
function mockFetch(routes) {
  globalThis.fetch = async url => {
    const u = String(url)
    for (const [k, v] of Object.entries(routes)) if (u.includes(k)) return typeof v === 'function' ? v() : v
    throw new Error('unexpected ' + u)
  }
}

const market = await import('../lib/market.ts')

test('provider time: missing or invalid becomes null, never "now"', () => {
  assert.equal(market.providerTime(undefined), null)
  assert.equal(market.providerTime(''), null)
  assert.equal(market.providerTime('garbage'), null)
  assert.equal(market.providerTime('2026-10-11T12:00:01.181Z'), '2026-10-11T12:00:01.181Z')
})

test('summary: Coinbase without a trade time reports null updatedAt', async () => {
  mockFetch({
    '/products/BTC-USD/stats': reply({ open: '82000', high: '84000', low: '81000', volume: '100', last: '83000' }),
    '/products/BTC-USD/ticker': reply({ price: '83050.39' }),
  })
  const s = await market.getSummary()
  assert.equal(s.price, 83050.39)
  assert.equal(s.updatedAt, null)
  assert.equal(effectiveState({ price: s.price, state: 'live', updatedAt: s.updatedAt }, false), 'stale')
})

test('summary: failed primary falls back to CoinGecko with its own time', async () => {
  mockFetch({
    'coinbase': () => Promise.reject(new Error('timeout')),
    '/coins/markets': reply([{ current_price: 83000, price_change_percentage_24h: 1, high_24h: 84000, low_24h: 81000, total_volume: 1e9, last_updated: '2026-10-11T11:59:00.000Z' }]),
  })
  const s = await market.getSummary()
  assert.equal(s.source, 'CoinGecko')
  assert.equal(s.updatedAt, '2026-10-11T11:59:00.000Z')
})

test('summary: both providers down returns the last good quote with its original time', async () => {
  mockFetch({ 'coinbase': () => Promise.reject(new Error('down')), '/coins/markets': () => Promise.reject(new Error('down')) })
  const s = await market.getSummary()
  assert.equal(s.updatedAt, '2026-10-11T11:59:00.000Z')
  assert.equal(effectiveState({ price: s.price, state: 'live', updatedAt: s.updatedAt }, false, Date.parse('2026-10-11T16:00:00Z')), 'stale')
})

test('summary: malformed provider data is rejected, not shown', async () => {
  mockFetch({
    '/products/BTC-USD/stats': reply({ open: 'x', high: 'x', low: 'x', volume: 'x' }),
    '/products/BTC-USD/ticker': reply({ price: 'NaN' }),
    '/coins/markets': reply([]),
  })
  // Falls back to the last good quote (with its real, old time) rather than
  // inventing one; nothing malformed reaches the page.
  const s = await market.getSummary()
  assert.equal(s.source, 'CoinGecko')
  assert.equal(s.updatedAt, '2026-10-11T11:59:00.000Z')
  globalThis.fetch = realFetch
})

// ---- device clock skew and out-of-order replies
const ms = await import('../lib/marketStatus.ts')

test('server-clock correction: a phone clock 35 min fast does not turn fresh quotes stale', () => {
  const realNow = Date.now
  try {
    const server = Date.parse('2026-10-11T12:00:00Z')
    Date.now = () => server + 35 * 60_000 // device clock 35 min ahead
    const quote = { price: 83050.39, state: 'live', updatedAt: new Date(server - 20_000).toISOString(), market: '24/7' }
    ms.setClockSkew(0)
    assert.equal(ms.effectiveState(quote, false), 'stale') // uncorrected: wrongly stale
    ms.setClockSkew(-35 * 60_000)
    assert.equal(ms.effectiveState(quote, false), 'live')
    assert.equal(ms.ageLabel(quote.updatedAt), '<1m')
    // A genuinely old quote is still stale with the correction applied.
    assert.equal(ms.effectiveState({ ...quote, updatedAt: new Date(server - 4 * 3600_000).toISOString() }, false), 'stale')
  } finally { Date.now = realNow; ms.setClockSkew(0) }
})

test('server-clock correction: invalid skew is ignored', () => {
  ms.setClockSkew(Number.NaN)
  assert.ok(Math.abs(ms.marketNow() - Date.now()) < 5)
  ms.setClockSkew(0)
})

const store = await import('../components/markets/assetStore.ts')
test('an older reply never replaces a newer quote on screen', () => {
  const a = (id, at, price) => ({ id, name: id, category: 'crypto', price, updatedAt: at, state: 'live' })
  const prev = [a('BTC', '2026-10-11T12:00:30Z', 83100), a('ETH', '2026-10-11T12:00:30Z', 2500)]
  const next = [a('BTC', '2026-10-11T12:00:00Z', 83000), a('ETH', '2026-10-11T12:01:30Z', 2510)]
  const out = store.newestOf(prev, next)
  assert.equal(out[0].price, 83100) // older BTC reply ignored
  assert.equal(out[1].price, 2510)  // newer ETH reply applied
  assert.deepEqual(store.newestOf(null, next), next)
  // A reply without a usable time is taken as given (it is labelled by the status rule).
  assert.equal(store.newestOf(prev, [a('BTC', null, null)])[0].price, null)
})

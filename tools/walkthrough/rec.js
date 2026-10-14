// Records the walkthrough scenes from the real application, signed in as an
// isolated demo user. Every API call is answered locally with labelled demo
// data: nothing reaches the production database, and no real client data,
// investment or transaction is involved.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('fs'), path = require('path')
const BASE = 'http://127.0.0.1:3100', KEY = 'sb-jdskpqjwmaeurxspipyv-auth-token', SB = /jdskpqjwmaeurxspipyv\.supabase\.co/
const OUT = path.join(process.env.WALKTHROUGH_OUT || __dirname, 'frames'); fs.mkdirSync(OUT, { recursive: true })
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const ME = { id: '99999999-9999-4999-8999-999999999999', email: 'demo@example.com', name: 'Demo Client' }
const exp = Math.floor(Date.now() / 1000) + 7200
const S = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, exp, role: 'authenticated', aud: 'authenticated' })}.sig`, refresh_token: 'demo', expires_at: exp, expires_in: 7200, token_type: 'bearer', user: { id: ME.id, email: ME.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } }
const now = Date.now(), ago = m => new Date(now - m * 60e3).toISOString(), day = d => new Date(now - d * 864e5).toISOString().slice(0, 10)
const ACC = { account_balance: 2500, available_balance: 2500, invested_balance: 995, pending_balance: 0, profit_balance: 0, trading_status: 'inactive', pending_transaction_count: 0 }
const TXS = [
  { id: 'd2', type: 'investment', method: 'available_balance', direction: null, source: 'investment_principal', amount: 1000, fee: 0, status: 'completed', reference: 'DEMO-INV-01', created_at: ago(60 * 24 * 3) },
  { id: 'd1', type: 'deposit', method: 'bank_transfer', direction: null, source: 'client_deposit', amount: 3500, fee: 0, status: 'completed', reference: 'DEMO-DEP-01', created_at: ago(60 * 24 * 5) },
]
const DESC = 'Demo product shown for illustration only. It is not an offer, and the figures are sample terms.'
const RISK = 'Investments carry risk. The value of an investment can go down as well as up, and returns are not guaranteed.'
const V = [
  { id: 'v1', product_id: 'p1', version: 1, name: 'Demo Balanced Portfolio', description: DESC, currency: 'USD', min_amount: 100, max_amount: 10000, term_days: 30, duration_value: 30, duration_unit: 'days', cancellation_allowed: true, cancellation_terms: 'A request can be cancelled while it is pending review.', risk_level: 'medium', risk_disclosure: RISK, terms_text: 'Sample terms for this demonstration.', entry_fee_pct: 0.005, return_type: 'fixed_rate', return_rate_pct: 1.5, return_amount: null, eligibility: { kyc_required: true }, published_at: '2026-09-01T00:00:00Z' },
  { id: 'v2', product_id: 'p2', version: 1, name: 'Demo Conservative Portfolio', description: DESC, currency: 'USD', min_amount: 250, max_amount: 25000, term_days: 14, duration_value: 14, duration_unit: 'days', cancellation_allowed: true, cancellation_terms: 'A request can be cancelled while it is pending review.', risk_level: 'low', risk_disclosure: RISK, terms_text: 'Sample terms for this demonstration.', entry_fee_pct: 0.0025, return_type: 'fixed_rate', return_rate_pct: 0.8, return_amount: null, eligibility: { kyc_required: true }, published_at: '2026-09-01T00:00:00Z' },
]
const P = [{ id: 'p1', code: 'demo-balanced', status: 'active', current_version_id: 'v1' }, { id: 'p2', code: 'demo-conservative', status: 'active', current_version_id: 'v2' }]
const INV = [{ id: 'i1', reference: 'DEMO-INV-01', product_id: 'p1', product_version_id: 'v1', principal: 995, fee_amount: 5, profit_amount: 0, return_type: 'fixed_rate', return_rate_pct: 1.5, expected_return: 14.93, expected_total: 1009.93, currency: 'USD', status: 'active', start_date: day(3), maturity_date: day(-27), completed_at: null, created_at: ago(60 * 24 * 3), is_historical: false }]
const SUM = { total_invested: 1000, total_count: 1, active_principal: 995, active_count: 1, pending_principal: 0, pending_count: 0, completed_principal: 0, completed_count: 0, investment_profit: 0 }
const RULES = [
  { id: 'r1', asset_id: 'BTC', kind: 'price_above', target: 70000, name: 'BTC above 70,000', status: 'active', last_evaluated_at: ago(0.3), last_price: 65210.55, last_change_pct: 1.89, last_data_state: 'live', triggered_at: null, trigger_price: null, last_error: null, created_at: ago(60 * 24 * 2) },
  { id: 'r2', asset_id: 'ETH', kind: 'pct_down', target: 3, name: 'ETH down 3% in 24h', status: 'active', last_evaluated_at: ago(0.3), last_price: 2724.57, last_change_pct: -0.84, last_data_state: 'live', triggered_at: null, trigger_price: null, last_error: null, created_at: ago(60 * 24) },
  { id: 'r3', asset_id: 'SOL', kind: 'price_above', target: 150, name: 'SOL above 150', status: 'triggered', last_evaluated_at: ago(40), last_price: 151.2, last_change_pct: 3.1, last_data_state: 'live', triggered_at: ago(40), trigger_price: 150.4, last_error: null, created_at: ago(60 * 30) },
]
const EVENTS = [{ id: 'e3', automation_id: 'r3', event: 'triggered', price: 150.4, created_at: ago(40) }, { id: 'e2', automation_id: 'r2', event: 'created', price: null, created_at: ago(60 * 24) }, { id: 'e1', automation_id: 'r1', event: 'created', price: null, created_at: ago(60 * 48) }]
const NOW = new Date().toISOString()
const mk = (id, name, price, ch, extra = {}) => ({ id, name, category: 'crypto', note: '', chart: true, automation: true, price, changePct: ch, changeAbs: price * ch / 100, high: price * 1.02, low: price * .98, prevClose: price, volume: 1e9, updatedAt: NOW, state: 'live', market: '24/7', source: 'Coinbase Exchange', reason: null, ...extra })
const ASSETS = [mk('BTC', 'Bitcoin', 65210.55, 1.89), mk('ETH', 'Ethereum', 2724.57, -0.84), mk('SOL', 'Solana', 151.2, 3.1), mk('XRP', 'XRP', 0.5231, 0.42)]
const ST = { status: { state: 'running', last_ok_at: new Date(now - 8000).toISOString(), market_at: new Date(now - 20000).toISOString(), last_evaluated: 3, monitored_count: 4, monitored: ['BTC', 'ETH', 'SOL', 'XRP'], presentation: { panel_visible: true, preview_visible: true, display_name: 'XAI Automation Engine', asset_labels: 'BTC · ETH', description: 'Configure rules that monitor supported markets. The engine evaluates them every minute and records activity for review.', animation: 'standard' }, at: NOW } }

async function setup(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'no-preference' })
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); try { sessionStorage.setItem('tf-demo', '1') } catch {} }, [KEY, JSON.stringify(S)])
  // Block every outside request (chat widget, analytics, third-party scripts).
  await ctx.route(url => !url.href.startsWith(BASE) && !SB.test(url.href), r => r.abort())
  await ctx.route(SB, r => {
    const u = new URL(r.request().url()), Pn = u.pathname, single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object')
    if (Pn.includes('/auth/v1/user')) return r.fulfill({ json: S.user })
    if (Pn.includes('/auth/v1/token')) return r.fulfill({ json: S })
    if (Pn.endsWith('/profiles')) return r.fulfill({ json: single ? { role: 'customer', full_name: ME.name } : [{ role: 'customer', full_name: ME.name }] })
    return r.fulfill({ headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' }, json: [] })
  })
  await ctx.route('**/api/market/assets', r => r.fulfill({ json: { assets: ASSETS, at: NOW } }))
  await ctx.route('**/api/market/candles**', r => {
    const u = new URL(r.request().url()), id = u.searchParams.get('id'), tf = u.searchParams.get('tf'), a = ASSETS.find(x => x.id === id) || ASSETS[0]
    let seed = [...(id + tf)].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const n = 60, step = 3600e3, t0 = Date.now() - n * step; let v = a.price * 0.97; const pts = []
    for (let i = 0; i < n; i++) { v = v * (1 + (rnd() - .47) * .008); pts.push([t0 + i * step, +v.toFixed(4)]) }
    pts.push([Date.now(), a.price]); return r.fulfill({ json: { points: pts, available: true } })
  })
  await ctx.route('**/api/automation/status', r => r.fulfill({ json: ST }))
  await ctx.route('**/api/client/**', r => {
    const url = r.request().url().split('?')[0]
    // Demo submission: answered locally with the status a real request gets
    // (pending review). Nothing is sent to the server or created anywhere.
    if (r.request().method() === 'POST' && url.endsWith('/investments')) return r.fulfill({ json: { investment: { id: 'demo-new', reference: 'DEMO-INV-02', status: 'pending_activation', principal: 995 } } })
    if (r.request().method() !== 'GET') return r.fulfill({ status: 403, json: { error: 'Demo account: read-only.' } })
    if (url.endsWith('/account')) return r.fulfill({ json: { user: { id: ME.id, email: ME.email, full_name: ME.name, role: 'customer' }, account: ACC, investments: SUM } })
    if (url.endsWith('/transactions')) return r.fulfill({ json: { transactions: TXS } })
    if (url.endsWith('/nav-config')) return r.fulfill({ json: { config: { hidden: [], order: [], labels: {}, updated_at: null } } })
    if (url.endsWith('/notifications')) return r.fulfill({ json: { notifications: [] } })
    if (url.endsWith('/kyc')) return r.fulfill({ json: { kyc: { status: 'verified', has_submission: true } } })
    if (url.endsWith('/automations')) return r.fulfill({ json: { automations: RULES, events: EVENTS } })
    if (url.endsWith('/investments')) return r.fulfill({ json: { products: P, versions: V, investments: INV, returns: [], events: [], adjustments: [], transactions: [], balance: { available: 2500, pending: 0, invested: 995 }, summary: SUM, kyc_verified: true, investing_enabled: true } })
    if (url.endsWith('/watchlist')) return r.fulfill({ json: { assets: ['BTC', 'ETH', 'SOL'] } })
    if (url.endsWith('/wallets')) return r.fulfill({ json: { wallets: [] } })
    return r.fulfill({ json: {} })
  })
  const page = await ctx.newPage()
  return { ctx, page }
}

// Demo label and a lower-third title, drawn over the real interface.
async function overlay(page, title, left = 284) {
  await page.evaluate(([title, left]) => {
    let o = document.getElementById('demo-ov')
    if (!o) {
      o = document.createElement('div'); o.id = 'demo-ov'
      o.innerHTML = '<style>#demo-ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,sans-serif}#demo-ov .b{position:absolute;right:18px;bottom:18px;padding:6px 12px;border-radius:999px;background:rgba(10,11,15,.82);border:1px solid rgba(247,147,26,.45);color:#f7b155;font-size:12px;font-weight:600;letter-spacing:.08em}#demo-ov .t{position:absolute;left:284px;bottom:26px;padding:12px 18px 12px 16px;border-left:3px solid #f7931a;border-radius:10px;background:rgba(10,11,15,.86);color:#f2f4f7;font-size:20px;font-weight:600;letter-spacing:-.01em;opacity:0;transform:translateY(10px);transition:all .6s ease}#demo-ov .t.on{opacity:1;transform:none}#demo-ov .t small{display:block;font-size:12px;font-weight:500;color:#aab1bd;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}</style><div class="b">DEMO ACCOUNT · SAMPLE DATA</div><div class="t"></div>'
      document.body.appendChild(o)
      // Hide the chat widget launcher if any.
      const s = document.createElement('style'); s.textContent = 'iframe[title*="chat" i],#tawk-bubble,.tawk-min-container{display:none!important}'; document.head.appendChild(s)
    }
    const t = o.querySelector('.t'); t.classList.remove('on'); t.style.left = left + 'px'
    if (title) { t.innerHTML = title; requestAnimationFrame(() => setTimeout(() => t.classList.add('on'), 60)) }
  }, [title, left])
}

// Screencast recorder: JPEG frames with timestamps.
async function record(page, name, ms, act) {
  const dir = path.join(OUT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const frames = []; let n = 0
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, String(n++).padStart(5, '0') + '.jpg')
    fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ file, t: f.metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  // Keep frames flowing even when nothing moves (a 1px invisible ticker).
  await page.evaluate(() => { if (!document.getElementById('tick')) { const d = document.createElement('div'); d.id = 'tick'; d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); let i = 0; setInterval(() => { d.style.background = (i++ % 2) ? '#000' : '#010101' }, 33) } })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 })
  const t0 = Date.now() / 1000
  await act()
  const left = ms - (Date.now() - t0 * 1000); if (left > 0) await page.waitForTimeout(left)
  const t1 = Date.now() / 1000
  await cdp.send('Page.stopScreencast')
  await page.waitForTimeout(200)
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ t0, t1, frames }))
  console.log(name, frames.length, 'frames', (t1 - t0).toFixed(2), 's')
}
const smoothScroll = (page, sel, to, ms) => page.evaluate(([sel, to, ms]) => new Promise(res => {
  const el = sel ? document.querySelector(sel) : document.scrollingElement; const from = el.scrollTop, t0 = performance.now()
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : res() }
  requestAnimationFrame(step)
}), [sel, to, ms])
async function moveClick(page, loc) {
  const b = await loc.boundingBox(); if (!b) return
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 }); await page.waitForTimeout(150); await loc.click()
}
module.exports = { setup, overlay, record, smoothScroll, moveClick, BASE, chromium }

if (require.main === module) (async () => {
  const which = process.argv.slice(2)
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'durations.json'), 'utf8'))
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  const want = id => !which.length || which.includes(id)
  // Scene 1: brand introduction (motion graphics page).
  if (want('s1')) {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
    await p.goto('file://' + path.join(__dirname, 'intro.html')); await p.waitForTimeout(50)
    await p.goto('file://' + path.join(__dirname, 'intro.html'))
    await record(p, 's1', D.s1 * 1000, async () => {})
  }
  const { page } = await setup(browser)
  const top = () => page.evaluate(() => document.scrollingElement.scrollTop = 0)
  // Scene 2: choose an investment (plans and plan details).
  if (want('s2')) {
    await page.goto(BASE + '/dashboard#portfolio'); await page.waitForTimeout(4000); await top(); await page.waitForTimeout(300)
    await overlay(page, '<small>Choose an investment</small>Investment plans')
    await record(page, 's2', D.s2 * 1000, async () => {
      await page.waitForTimeout(2600)
      await page.mouse.move(400, 300, { steps: 12 }); await page.waitForTimeout(500)
      await overlay(page, '<small>Choose an investment</small>Review the terms', 28)
      await moveClick(page, page.locator('[data-plan-details]').first()); await page.waitForTimeout(2600)
      const sheet = await page.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog] *')].find(e => e.scrollHeight > e.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); if (d) { d.id = d.id || 'sheet-scroll'; return '#' + d.id } return null })
      if (sheet) await smoothScroll(page, sheet, 330, 3000)
    })
  }
  // Scene 3: place an investment (amount, review, confirm; demo result).
  if (want('s3')) {
    await overlay(page, '<small>Place an investment</small>Amount · Review · Confirm', 28)
    await record(page, 's3', D.s3 * 1000, async () => {
      await moveClick(page, page.locator('[data-plan-start]')); await page.waitForTimeout(700)
      const amt = page.locator('[data-invest-amount]'); await amt.click(); await page.keyboard.type('1000', { delay: 90 }); await page.waitForTimeout(600)
      await moveClick(page, page.locator('[data-invest-continue]')); await page.waitForTimeout(1300)
      const sheet = await page.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog] *')].find(e => e.scrollHeight > e.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); if (d) { d.id = d.id || 'sheet-scroll2'; return '#' + d.id } return null })
      if (sheet) { await smoothScroll(page, sheet, 9999, 2000); await page.waitForTimeout(300) }
      await moveClick(page, page.locator('[data-invest-accept]')); await page.waitForTimeout(400)
      await moveClick(page, page.locator('[data-invest-confirm]')); await page.waitForSelector('[data-invest-result]', { timeout: 5000 })
      await page.evaluate(() => { const d = document.querySelector('#sheet-scroll2'); if (d) d.scrollTop = 0 })
    })
  }
  // Scene 4: track progress (My investments and an investment's details).
  if (want('s4')) {
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(1500); await page.goto(BASE + '/dashboard#portfolio'); await page.reload(); await page.waitForTimeout(3800)
    await page.evaluate(() => { const el = document.getElementById('inv-mine-section'); if (el) document.scrollingElement.scrollTop = el.getBoundingClientRect().top + scrollY - 80 }); await page.waitForTimeout(400)
    await overlay(page, '<small>Track your investments</small>Progress and credited returns')
    await record(page, 's4', D.s4 * 1000, async () => {
      await page.waitForTimeout(3600)
      await moveClick(page, page.locator('[data-inv-open]').first()); await page.waitForTimeout(2800)
      const sheet = await page.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog] *')].find(e => e.scrollHeight > e.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); if (d) { d.id = d.id || 'sheet-scroll3'; return '#' + d.id } return null })
      if (sheet) await smoothScroll(page, sheet, 360, 2600)
    })
  }
  // Scene 5: market monitoring (XAI Automation Engine).
  if (want('s5')) {
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(3800)
    await page.evaluate(() => { const c = document.querySelector('[data-ov-automation]'); if (c) c.scrollIntoView({ block: 'center' }) }); await page.waitForTimeout(700)
    await overlay(page, '<small>Market monitoring</small>XAI Automation Engine')
    await record(page, 's5', D.s5 * 1000, async () => { await page.waitForTimeout(3000); await smoothScroll(page, null, (await page.evaluate(() => scrollY)) + 160, 2200) })
  }
  if (want('s6')) {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
    await p.goto('file://' + path.join(__dirname, 'outro.html'))
    await record(p, 's6', D.s6 * 1000, async () => {})
  }
  await browser.close()
})()

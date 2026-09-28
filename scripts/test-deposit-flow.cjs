/* Route-level test of the real deposit flow files, against a fake Supabase
   that enforces the same rule the real one does: Storage parses the
   Authorization bearer as a JWT and rejects anything else. */
const Module = require('module')
const fs = require('fs')
const path = require('path')
const { transform } = require('sucrase')
const ROOT = path.join(__dirname, '..')

const isJwt = v => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v)
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' }
const USER_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExIn0.sig'
const state = { storageBearer: null, uploaded: [], rpc: [], objects: [] }

// ---- fake @supabase/supabase-js -------------------------------------------
function fakeCreateClient(url, key, opts = {}) {
  const bearer = (opts.global?.headers?.Authorization || `Bearer ${key}`).replace(/^Bearer\s+/, '')
  return {
    auth: {
      getUser: async t => isJwt(t) ? { data: { user: USER }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    storage: {
      from: () => ({
        upload: async (p, _buf, o) => {
          state.storageBearer = bearer
          // This is what Supabase Storage really does with the bearer.
          if (!isJwt(bearer)) return { data: null, error: { message: 'Invalid Compact JWS' } }
          if (state.objects.includes(p)) return { data: null, error: { message: 'The resource already exists' } }
          // Enforce the storage RLS policy: own folder only.
          if (p.split('/')[0] !== USER.id) return { data: null, error: { message: 'new row violates row-level security policy' } }
          state.objects.push(p); state.uploaded.push({ path: p, type: o?.contentType })
          return { data: { path: p }, error: null }
        },
      }),
    },
    rpc: async (fn, args) => {
      state.rpc.push({ fn, args, bearer })
      if (!isJwt(bearer)) return { data: null, error: { message: 'Invalid Compact JWS' } }
      if (fn === 'client_nav_is_hidden') return { data: false, error: null }
      if (fn === 'client_submit_deposit') {
        if (args.p_receipt_path && !new RegExp(`^${USER.id}/[A-Za-z0-9_.-]+$`).test(args.p_receipt_path)) {
          return { data: null, error: { message: 'Invalid receipt' } }
        }
        return { data: { id: 'dep-1', reference: 'DEP-TEST01', status: 'pending_review', created_at: new Date().toISOString() }, error: null }
      }
      return { data: null, error: null }
    },
  }
}

// Let require() handle .ts files and the "@/" path alias, like Next does.
require.extensions['.ts'] = (m, file) => {
  m._compile(transform(fs.readFileSync(file, 'utf8'), { transforms: ['typescript', 'imports'], filePath: file }).code, file)
}

const origLoad = Module._load
Module._load = function (req, parent, isMain) {
  if (req.startsWith('@/')) req = path.join(ROOT, req.slice(2))
  if (req === '@supabase/supabase-js') return { createClient: fakeCreateClient }
  if (req === 'next/server') {
    return {
      NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) },
      NextRequest: class {},
    }
  }
  return origLoad.call(this, req, parent, isMain)
}

// ---- load the real route files --------------------------------------------
const loadRoute = rel => require(path.join(ROOT, rel))
const upload = loadRoute('app/api/client/upload-receipt/route.ts')
const deposit = loadRoute('app/api/client/deposit/route.ts')

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const mkReq = (auth, { form, json } = {}) => ({
  headers: { get: h => (h.toLowerCase() === 'authorization' ? (auth ? `Bearer ${auth}` : '') : null) },
  formData: async () => form,
  json: async () => json,
  nextUrl: { searchParams: new URLSearchParams() },
})
const mkForm = (file, key) => ({ get: k => (k === 'file' ? file : k === 'key' ? key : null) })
const mkFile = (buf, type) => ({ type, size: buf.length, arrayBuffer: async () => buf })

const out = []
const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)

;(async () => {
  // 1. Full happy path: upload receipt -> submit deposit
  let r = await upload.POST(mkReq(USER_JWT, { form: mkForm(mkFile(png, 'image/png'), 'abcdefgh12345678') }))
  ok('receipt upload succeeds (no Invalid Compact JWS)', r.status === 200 && !!r.body.path, JSON.stringify(r.body))
  ok('storage received the user JWT, not an API key', isJwt(state.storageBearer), state.storageBearer?.slice(0, 22))
  ok('receipt stored under the client\'s own folder', r.body.path?.startsWith(USER.id + '/'), r.body.path)

  const d = await deposit.POST(mkReq(USER_JWT, { json: { amount: 250, method: 'bitcoin', receipt_path: r.body.path, idempotency_key: 'abcdefgh12345678' } }))
  ok('deposit record created, pending review', d.status === 200 && d.body.deposit?.status === 'pending_review' && d.body.deposit?.reference === 'DEP-TEST01', JSON.stringify(d.body))
  const rpc = state.rpc.find(x => x.fn === 'client_submit_deposit')
  ok('deposit carries amount, method, receipt and idempotency key',
    rpc?.args.p_amount === 250 && rpc?.args.p_method === 'bitcoin' && rpc?.args.p_receipt_path === r.body.path && !!rpc?.args.p_idempotency_key)

  // 2. Retry with the same key reuses the stored file (no duplicate)
  const before = state.uploaded.length
  const r2 = await upload.POST(mkReq(USER_JWT, { form: mkForm(mkFile(png, 'image/png'), 'abcdefgh12345678') }))
  ok('retrying the same upload reuses the file', r2.status === 200 && r2.body.path === r.body.path && state.uploaded.length === before)

  // 3. A malformed token never reaches Supabase; client is told to sign in
  const bad = await upload.POST(mkReq('not-a-jwt', { form: mkForm(mkFile(png, 'image/png')) }))
  ok('malformed token -> 401 "Please sign in again." (not a raw error)',
    bad.status === 401 && bad.body.error === 'Please sign in again.' && !/JWS/i.test(bad.body.error), JSON.stringify(bad.body))
  const badDep = await deposit.POST(mkReq('not-a-jwt', { json: { amount: 10, method: 'bitcoin' } }))
  ok('malformed token on deposit -> 401, no raw error', badDep.status === 401 && !/JWS/i.test(JSON.stringify(badDep.body)), JSON.stringify(badDep.body))

  // 4. No technical wording reaches the client in any response body
  const bodies = [r, d, r2, bad, badDep].map(x => JSON.stringify(x.body)).join(' ')
  ok('no response body leaks internal error text',
    !/JWS|JWT|supabase|row-level|policy|sb_secret/i.test(bodies), bodies.slice(0, 120))

  // 5. Validation still enforced
  const wrongType = await upload.POST(mkReq(USER_JWT, { form: mkForm(mkFile(Buffer.from('hello'), 'image/png')) }))
  ok('content that is not really a PNG is rejected', wrongType.status === 400 && /valid JPG/.test(wrongType.body.error))
  const tooBig = await upload.POST(mkReq(USER_JWT, { form: mkForm(mkFile(Buffer.alloc(6 * 1024 * 1024), 'image/png')) }))
  ok('oversized receipt rejected', tooBig.status === 400 && /5 MB/.test(tooBig.body.error))
  const noAuth = await upload.POST(mkReq(null, { form: mkForm(mkFile(png, 'image/png')) }))
  ok('no token -> 401', noAuth.status === 401)

  console.log(out.join('\n'))
  console.log(`${out.length} checks, ${out.filter(l => l.startsWith('FAIL')).length} failed`)
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0)
})()

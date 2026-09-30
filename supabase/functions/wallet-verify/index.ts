// Wallet ownership verification (non-custodial).
//
// The client asks the database for a single-use challenge message
// (client_wallet_challenge), signs it in their own wallet (personal_sign: no
// transaction, no funds, no permissions), and sends the signature here. This
// function recovers the signing address from the signature and, only if it
// matches, records the link through wallet_record_verified, which only the
// service role may execute. The signature is checked and discarded; it is
// never stored. Private keys and recovery phrases are never requested.
//
// Deployed with verify_jwt = false: the caller is verified below against the
// Auth server (auth.getUser), which works with any JWT signing key type.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyMessage, isAddress } from 'npm:viem@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const auth = req.headers.get('Authorization') || ''
  if (!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(auth)) return json({ error: 'Please sign in again.' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: who, error: whoErr } = await caller.auth.getUser()
  if (whoErr || !who?.user) return json({ error: 'Please sign in again.' }, 401)
  const userId = who.user.id

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const challengeId = String(body.challenge_id ?? '')
  const address = String(body.address ?? '').trim().toLowerCase()
  const signature = String(body.signature ?? '').trim()
  const label = String(body.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const walletName = String(body.wallet_name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!UUID.test(challengeId)) return json({ error: 'This verification request was not found. Start again.' }, 400)
  if (!isAddress(address, { strict: false })) return json({ error: 'That is not a valid wallet address.' }, 400)
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return json({ error: 'The wallet returned an unexpected signature. Try again or use another wallet.' }, 400)

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  // Only the caller's own, unused, unexpired challenge can be verified.
  const { data: ch, error: chErr } = await service.from('wallet_challenges')
    .select('id, message, address, expires_at, used_at').eq('id', challengeId).eq('user_id', userId).maybeSingle()
  if (chErr) return json({ error: 'Verification is temporarily unavailable. Please try again.' }, 503)
  if (!ch) return json({ error: 'This verification request was not found. Start again.' }, 404)
  if (ch.used_at) return json({ error: 'This verification request was already used. Start again.' }, 409)
  if (new Date(ch.expires_at).getTime() < Date.now()) return json({ error: 'This verification request expired. Start again.' }, 410)
  if (ch.address !== address) return json({ error: 'The connected wallet changed. Start the verification again with the current account.' }, 409)

  let valid = false
  try {
    valid = await verifyMessage({ address: address as `0x${string}`, message: ch.message, signature: signature as `0x${string}` })
  } catch { valid = false }
  if (!valid) return json({ error: 'The signature does not match this wallet. Make sure you sign with the same account you connected.' }, 400)

  const { data, error } = await service.rpc('wallet_record_verified', {
    p_user: userId, p_challenge: challengeId, p_address: address, p_label: label, p_wallet_name: walletName,
  })
  if (error) {
    const msg = error.message || ''
    if (/^(This|You|The) /.test(msg)) return json({ error: msg }, 409)
    console.error('wallet-verify: record failed', error.code)
    return json({ error: 'The wallet could not be linked. Please try again.' }, 500)
  }
  const res = data as { wallet_id?: string; status?: string; error?: string; code?: string }
  if (res.error) return json({ error: res.error, code: res.code }, 409)
  return json({ wallet_id: res.wallet_id, status: res.status }, 200)
})

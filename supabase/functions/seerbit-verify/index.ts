// SeerBit payment verification (server-side only).
//
// A payment is marked successful only after SeerBit's own transaction record
// says so, read here with the merchant keys that exist only as Edge Function
// secrets. Returning from the payment page proves nothing on its own.
// engine_payment_verified() also checks the amount and currency against what
// Tarafab expected, and activates Premium once per payment reference.
//
// Secrets (Supabase → Edge Functions → seerbit-verify):
//   SEERBIT_PUBLIC_KEY, SEERBIT_SECRET_KEY   from the SeerBit merchant dashboard
//   SEERBIT_API_BASE                         optional, default https://seerbitapi.com
//   SEERBIT_TOKEN_PATH / SEERBIT_QUERY_PATH  optional overrides if SeerBit's API
//                                            paths differ for this account
// Without the keys, nothing is verified automatically (the payment stays
// "pending verification" for an admin to confirm from SeerBit's dashboard).
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUB = (Deno.env.get('SEERBIT_PUBLIC_KEY') || '').trim()
const SEC = (Deno.env.get('SEERBIT_SECRET_KEY') || '').trim()
const BASE = (Deno.env.get('SEERBIT_API_BASE') || 'https://seerbitapi.com').replace(/\/$/, '')
const TOKEN_PATH = Deno.env.get('SEERBIT_TOKEN_PATH') || '/api/v2/encrypt/keys'
const QUERY_PATH = Deno.env.get('SEERBIT_QUERY_PATH') || '/api/v3/payments/query/'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// Reads SeerBit's transaction record into a neutral shape (exported for tests).
export function readSeerbit(body: unknown): { found: boolean; success: boolean; amount: number | null; currency: string | null; reference: string | null; detail: string } {
  const d = (body as { data?: { payments?: Record<string, unknown> } & Record<string, unknown> })?.data
  const p = (d?.payments || d || {}) as Record<string, unknown>
  const code = String(p.gatewayCode ?? p.code ?? (body as { code?: string })?.code ?? '')
  const status = String(p.status ?? p.paymentStatus ?? '').toUpperCase()
  const amount = Number(p.amount ?? p.amountPaid)
  const found = Object.keys(p).length > 0
  return {
    found,
    success: found && (code === '00' || status === 'SUCCESSFUL' || status === 'SUCCESS'),
    amount: Number.isFinite(amount) ? amount : null,
    currency: typeof p.currency === 'string' ? p.currency.toUpperCase() : null,
    reference: typeof p.paymentReference === 'string' ? p.paymentReference : null,
    detail: String(p.gatewayMessage ?? p.reason ?? p.message ?? (body as { message?: string })?.message ?? '').slice(0, 200),
  }
}

async function seerbitToken() {
  const r = await fetch(BASE + TOKEN_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `${SEC}.${PUB}` }), signal: AbortSignal.timeout(15_000) })
  const b = await r.json().catch(() => ({}))
  const token = b?.data?.EncryptedSecKey?.encryptedKey || b?.data?.encryptedKey
  if (!r.ok || !token) throw new Error('SeerBit authentication failed')
  return token as string
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = await req.json().catch(() => ({})) as { reference?: string; provider_reference?: string }
  // Server mode (SeerBit webhook via the app server): proven with the payment
  // gateway key, looks the payment up by SeerBit's reference. The webhook
  // body is never trusted; the status is read from SeerBit below.
  const gk = (req.headers.get('x-gateway-key') || '').trim()
  let a: { id: string; user_id: string; reference: string; provider_reference: string | null; status: string } | null = null
  if (gk) {
    const { data: ok } = await db.rpc('_gateway_key_ok', { p_key: gk })
    if (ok !== true) return json({ error: 'Not authorized.' }, 401)
    const pref = String(body.provider_reference || '')
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(pref)) return json({ error: 'Invalid reference.' }, 400)
    const { data } = await db.from('payment_attempts').select('id, user_id, reference, provider_reference, status').eq('provider', 'seerbit').eq('provider_reference', pref)
      .in('status', ['redirected', 'pending_verification', 'successful']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data) return json({ status: 'pending', reason: 'not_matched' })
    a = data
  }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u } = gk ? { data: { user: null } } : token ? await db.auth.getUser(token) : { data: { user: null } }
  if (!gk && !u?.user) return json({ error: 'Please sign in again.' }, 401)
  const ref = a ? a.reference : String(body.reference || '')
  if (!/^PAY-[A-Z0-9]{12}$/.test(ref)) return json({ error: 'Invalid payment reference.' }, 400)

  // Owner, or an admin verifying from the admin panel.
  if (!a) ({ data: a } = await db.from('payment_attempts').select('id, user_id, reference, provider_reference, status').eq('reference', ref).maybeSingle())
  if (!a) return json({ error: 'Payment not found.' }, 404)
  if (!gk && a.user_id !== u!.user!.id) {
    const { data: prof } = await db.from('profiles').select('role').eq('id', u!.user!.id).maybeSingle()
    if (prof?.role !== 'admin') return json({ error: 'Payment not found.' }, 404)
  }
  if (a.status === 'successful') return json({ status: 'successful' })
  if (!PUB || !SEC) return json({ status: 'pending', reason: 'not_configured' })
  if (!a.provider_reference) return json({ status: 'pending', reason: 'no_provider_reference' })
  try {
    const tk = await seerbitToken()
    const r = await fetch(BASE + QUERY_PATH + encodeURIComponent(a.provider_reference), { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(15_000) })
    const s = readSeerbit(await r.json().catch(() => ({})))
    if (!s.found) return json({ status: 'pending', reason: 'not_found_yet' })
    const { data: out, error } = await db.rpc('engine_payment_verified', { p_reference: ref, p_success: s.success, p_provider_reference: s.reference || a.provider_reference, p_amount: s.amount, p_currency: s.currency, p_detail: s.detail })
    if (error) return json({ error: 'Could not record the verification.' }, 500)
    return json({ status: out === 'already' ? 'successful' : out })
  } catch {
    return json({ status: 'pending', reason: 'provider_unreachable' })
  }
})

// Server-only module: imported by API routes, never by client components.
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { gatewayKey } from '@/lib/payments'

// Paystack, server side only. The secret key is read from the server
// environment (PAYSTACK_SECRET_KEY) and never reaches the browser, logs or
// API responses. Test and live mode follow the key (sk_test_… / sk_live_…).
const API = (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '')
export const paystackSecret = () => (process.env.PAYSTACK_SECRET_KEY || '').trim()
export const paystackMode = () => (paystackSecret().startsWith('sk_live_') ? 'live' : paystackSecret().startsWith('sk_test_') ? 'test' : 'unknown')
export const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://tarafabxai.vercel.app').replace(/\/$/, '')

type PsResponse<T> = { status: boolean; message: string; data?: T }

async function ps<T>(path: string, init?: RequestInit): Promise<PsResponse<T>> {
  const r = await fetch(API + path, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${paystackSecret()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const body = await r.json().catch(() => ({ status: false, message: `Paystack responded ${r.status}` })) as PsResponse<T>
  if (!r.ok && body.status !== false) return { status: false, message: `Paystack responded ${r.status}` }
  return body
}

// Amounts are sent in the currency's smallest unit (kobo for NGN).
export const toMinor = (amount: number) => Math.round(Number(amount) * 100)

export async function paystackInitialize(input: { email: string; amount: number; currency: string; reference: string; planId: string; planName: string; userId: string }) {
  return ps<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email, amount: toMinor(input.amount), currency: input.currency, reference: input.reference,
      callback_url: `${appUrl()}/payment/return?provider=paystack`,
      metadata: { user_id: input.userId, plan_id: input.planId, plan_name: input.planName, internal_reference: input.reference },
    }),
  })
}

export type PsVerify = { status: string; reference: string; amount: number; currency: string; id: number; gateway_response?: string; paid_at?: string | null }
export async function paystackVerify(reference: string) {
  return ps<PsVerify>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

// x-paystack-signature = HMAC-SHA512 of the raw request body with the secret key.
export function paystackSignatureValid(raw: string, signature: string | null, secret = paystackSecret()) {
  if (!secret || !signature || !/^[0-9a-f]{128}$/i.test(signature)) return false
  const expected = crypto.createHmac('sha512', secret).update(raw, 'utf8').digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'))
}

// Records a result in the database through the gateway-key function (works
// from the webhook too, where there is no signed-in user).
export async function recordPaystackResult(reference: string, status: string, amountMinor: number | null, currency: string | null, providerId: string | null, detail: string) {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.rpc('gateway_paystack_result', { p_key: gatewayKey(), p_reference: reference, p_status: status, p_amount_minor: amountMinor ?? 0,
    p_currency: currency, p_provider_id: providerId, p_detail: detail.slice(0, 200) })
  if (error) { console.error('paystack: could not record result', reference, error.code); return null }
  return String(data)
}

// Verify a reference with Paystack and record the trusted result.
export async function verifyAndRecord(reference: string) {
  if (!paystackSecret()) return { status: 'pending', reason: 'not_configured' }
  let v: PsResponse<PsVerify>
  try { v = await paystackVerify(reference) } catch { return { status: 'pending', reason: 'provider_unreachable' } }
  if (!v.status || !v.data) return { status: 'pending', reason: 'not_found_yet' }
  const d = v.data
  const st = d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : d.status === 'reversed' ? 'reversed' : d.status === 'abandoned' ? 'abandoned' : 'pending'
  const out = await recordPaystackResult(reference, st, Number(d.amount), d.currency, String(d.id ?? ''), d.gateway_response || d.status)
  console.info('paystack: verified', reference, st, out)
  return { status: out === 'already' ? 'successful' : out || 'pending' }
}

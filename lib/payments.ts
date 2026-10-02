import type { NextRequest } from 'next/server'
import { functionsUrl, getSupabaseEnv } from '@/lib/supabase/env'

// Country of the visitor as determined by the hosting platform from the
// connection's IP address (Vercel sets x-vercel-ip-country itself). IP
// geolocation is an estimate (VPNs and proxies change it); anything that is
// not a clear two-letter country is treated as unknown, and unknown is never
// allowed through to the payment page.
export function visitorCountry(request: NextRequest): string | null {
  const c = (request.headers.get('x-vercel-ip-country') || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null
}

// Server-only key proving to the database that the payment URL is requested
// by this server (after the country check), not directly by a browser.
export const gatewayKey = () => (process.env.PAYMENT_GATEWAY_KEY || '').trim()

export async function verifyPayment(token: string, reference: string) {
  try {
    const r = await fetch(`${functionsUrl()}/seerbit-verify`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: getSupabaseEnv().anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }), signal: AbortSignal.timeout(25_000), cache: 'no-store',
    })
    return await r.json().catch(() => ({})) as { status?: string; reason?: string }
  } catch { return { status: 'pending', reason: 'provider_unreachable' } }
}

// Server-to-server verification for the SeerBit webhook: the gateway key
// proves the call comes from this server; seerbit-verify then reads the
// transaction from SeerBit itself before anything is recorded.
export async function verifyByProviderReference(providerReference: string) {
  const key = gatewayKey()
  if (key.length < 32) return { status: 'pending', reason: 'not_configured' }
  try {
    const r = await fetch(`${functionsUrl()}/seerbit-verify`, {
      method: 'POST', headers: { apikey: getSupabaseEnv().anonKey, Authorization: `Bearer ${getSupabaseEnv().anonKey}`, 'x-gateway-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_reference: providerReference }), signal: AbortSignal.timeout(25_000), cache: 'no-store',
    })
    return await r.json().catch(() => ({})) as { status?: string; reason?: string }
  } catch { return { status: 'pending', reason: 'provider_unreachable' } }
}

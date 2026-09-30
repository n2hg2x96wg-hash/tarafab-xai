import { NextRequest, NextResponse } from 'next/server'
import { functionsUrl, getSupabaseEnv, isJwt } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

// Forwards a signed ownership message to the wallet-verify Edge Function,
// which checks the signature and records the link. This route holds no
// privileged key and never stores or logs the signature.
export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !isJwt(token)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const limited = rateLimited(`wallet-verify:${clientIp(request)}`, 20, 10 * 60_000)
  if (limited) return limited
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const payload = {
    challenge_id: String(body.challenge_id ?? ''), address: String(body.address ?? ''), signature: String(body.signature ?? ''),
    label: String(body.label ?? '').slice(0, 60), wallet_name: String(body.wallet_name ?? '').slice(0, 60),
  }
  try {
    const res = await fetch(`${functionsUrl()}/wallet-verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: getSupabaseEnv().anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) {
      return NextResponse.json({ error: typeof data.error === 'string' ? data.error : 'The wallet could not be verified. Please try again.', code: data.code }, { status: res.status })
    }
    return NextResponse.json({ wallet_id: data.wallet_id, status: data.status })
  } catch (e: unknown) {
    console.error('wallet-verify: unreachable:', e instanceof Error ? e.name : 'error')
    return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 })
  }
}

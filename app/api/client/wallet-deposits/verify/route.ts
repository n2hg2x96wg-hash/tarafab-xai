import { NextRequest, NextResponse } from 'next/server'
import { functionsUrl, getSupabaseEnv, isJwt } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !isJwt(token)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const limited = rateLimited('wallet-deposit-verify:' + clientIp(request), 20, 10 * 60_000)
  if (limited) return limited
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const intentId = String(body.intent_id || ''), txHash = String(body.tx_hash || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(intentId) || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: 'Invalid deposit verification request.' }, { status: 400 })
  try {
    const res = await fetch(functionsUrl() + '/wallet-deposit-verify', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, apikey: getSupabaseEnv().anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent_id: intentId, tx_hash: txHash }),
      signal: AbortSignal.timeout(25_000), cache: 'no-store',
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) return NextResponse.json({ error: typeof data.error === 'string' ? data.error : 'The deposit could not be verified yet.', status: data.status }, { status: res.status })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Connection temporarily unavailable. Please try again.' }, { status: 503 }) }
}

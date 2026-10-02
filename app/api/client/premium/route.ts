import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { functionsUrl, getSupabaseEnv } from '@/lib/supabase/env'
import { clientIp, rateLimited } from '@/lib/rateLimit'

async function billing(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${functionsUrl()}/billing`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: getSupabaseEnv().anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000), cache: 'no-store',
  })
  return { status: res.status, data: await res.json().catch(() => ({})) as Record<string, unknown> }
}

// Entitlement, limits and plans come from the database (client_premium_info);
// Premium is never granted here: checkout only opens the payment provider,
// and access changes when its verified webhook arrives.
export async function GET(request: NextRequest) {
  const { supabase, token } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.rpc('client_premium_info')
  if (error) return dbError(error)
  let payments = false
  try { payments = (await billing(token, { action: 'status' })).data.configured === true } catch { /* shown as unavailable */ }
  return NextResponse.json({ ...(data as object), payments })
}

export async function POST(request: NextRequest) {
  const { supabase, token } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`premium:${clientIp(request)}`, 10, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (!['checkout', 'cancel', 'resume'].includes(String(b.action))) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  if (b.action === 'checkout' && !/^[a-z0-9_-]{2,40}$/.test(String(b.plan_id ?? ''))) return NextResponse.json({ error: 'Choose a plan.' }, { status: 400 })
  try {
    const r = await billing(token, { action: b.action, plan_id: b.plan_id })
    if (r.status >= 400) return NextResponse.json({ error: typeof r.data.error === 'string' ? r.data.error : 'Payments are unavailable right now.', code: r.data.code }, { status: r.status })
    const url = typeof r.data.url === 'string' && /^https:\/\/checkout\.stripe\.com\//.test(r.data.url) ? r.data.url : undefined
    return NextResponse.json({ ok: true, url, pending: r.data.pending === true })
  } catch {
    return NextResponse.json({ error: 'Payments are unavailable right now. Please try again.' }, { status: 503 })
  }
}

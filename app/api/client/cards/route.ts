import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { limitUser } from '@/lib/userRateLimit'

// Card Center for the signed-in client: enabled designs, the fee and terms
// (when applications are open), the client's saved preview and their own
// applications. All checks run in the database functions.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.rpc('client_card_center')
  if (error) return dbError(error)
  return NextResponse.json(data)
}

const COLOR = /^#[0-9a-fA-F]{6}$/
const DESIGN = /^[a-z0-9_-]{2,32}$/

// { action: 'preference', design, color, nickname } saves the preview.
// { action: 'apply', design, color, nickname, expected_fee, accept_terms } pays
// the fixed fee from the wallet and submits one application. The fee charged
// is the server's; expected_fee only guards against a fee change mid-review.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`cards:${clientIp(request)}`, 30, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const design = String(b.design ?? ''), color = String(b.color ?? '')
  const nickname = typeof b.nickname === 'string' ? b.nickname.slice(0, 40) : null
  if (!DESIGN.test(design)) return NextResponse.json({ error: 'Choose a card design.' }, { status: 400 })
  if (!COLOR.test(color)) return NextResponse.json({ error: 'Choose a card colour.' }, { status: 400 })

  if (b.action === 'preference') {
    const { data, error } = await supabase.rpc('client_card_save_preference', { p_design: design, p_color: color, p_nickname: nickname })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  if (b.action === 'apply') {
    const key = idempotencyKey(request, b as { idempotency_key?: unknown })
    if (!key) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    const fee = Number(b.expected_fee)
    if (!Number.isFinite(fee) || fee <= 0) return NextResponse.json({ error: 'Review the card fee before you confirm.' }, { status: 400 })
    { const l = await limitUser(supabase, 'card_apply', 5, 600); if (l) return l }
    const { data, error } = await supabase.rpc('client_card_apply', {
      p_design: design, p_color: color, p_nickname: nickname, p_expected_fee: fee, p_accept_terms: b.accept_terms === true, p_idempotency_key: key,
    })
    if (error) return dbError(error)
    return NextResponse.json(data)
  }
  return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
}

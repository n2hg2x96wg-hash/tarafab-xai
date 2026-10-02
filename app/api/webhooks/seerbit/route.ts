import { NextRequest, NextResponse } from 'next/server'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { verifyByProviderReference } from '@/lib/payments'

// SeerBit webhook. The body is only used to learn which SeerBit reference
// changed; the outcome is always read back from SeerBit by seerbit-verify
// (amount and currency checked against the plan) before Premium can
// activate, so a forged notification cannot mark anything as paid.
function references(body: unknown): string[] {
  const items = (body as { notificationItems?: { notificationRequestItem?: { data?: Record<string, unknown> } }[] })?.notificationItems
  const datas = Array.isArray(items) ? items.map(i => i?.notificationRequestItem?.data || {}) : [((body as { data?: Record<string, unknown> })?.data || body || {}) as Record<string, unknown>]
  const out = new Set<string>()
  for (const d of datas) for (const k of ['paymentReference', 'reference', 'linkingReference']) {
    const v = d?.[k]
    if (typeof v === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(v)) out.add(v)
  }
  return Array.from(out).slice(0, 5)
}

export async function POST(request: NextRequest) {
  const limited = rateLimited(`seerbit-hook:${clientIp(request)}`, 60, 60_000)
  if (limited) return limited
  const body = await request.json().catch(() => null)
  for (const ref of references(body)) {
    const r = await verifyByProviderReference(ref)
    console.info('seerbit webhook:', ref, r.status, r.reason || '')
  }
  // Always acknowledge so SeerBit does not retry forever; the return page
  // and status checks verify independently.
  return NextResponse.json({ received: true })
}

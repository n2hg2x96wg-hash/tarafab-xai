import { NextRequest, NextResponse } from 'next/server'

// Best-effort fixed-window limiter held in server memory. Each server
// instance counts separately, so this only damps request storms (a stuck
// button, a script hammering sign-in); the database enforces the limits that
// protect money movements, and Supabase Auth applies its own limits too.
const buckets = new Map<string, { count: number; resetAt: number }>()

export function clientIp(request: NextRequest) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.ip || 'unknown'
}

export function rateLimited(key: string, limit: number, windowMs: number): NextResponse | null {
  const now = Date.now()
  if (buckets.size > 10_000) {
    buckets.forEach((b, k) => { if (b.resetAt <= now) buckets.delete(k) })
  }
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }
  b.count += 1
  if (b.count <= limit) return null
  const retryAfter = Math.ceil((b.resetAt - now) / 1000)
  return NextResponse.json(
    { error: `Too many attempts. Please wait ${retryAfter < 60 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`} and try again.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

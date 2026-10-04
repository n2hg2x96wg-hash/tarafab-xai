import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { featureHidden } from '@/lib/features'

export const dynamic = 'force-dynamic'

// Public pricing: enabled plans and the free limits. No payment destinations
// or provider identifiers are included.
export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  // Premium switched off by an admin: no plans are offered anywhere.
  if (await featureHidden(sb, 'premium')) return NextResponse.json({ plans: [], free: null, code: 'FEATURE_DISABLED' }, { headers: { 'Cache-Control': 'no-store' } })
  const [p, s] = await Promise.all([
    sb.from('premium_plans').select('id, name, tier, billing_interval, billing_period, price, promo_price, promo_label, currency, description, features, highlighted, sort_order').eq('enabled', true).order('sort_order').order('price'),
    sb.from('premium_settings').select('free_automation_limit, free_watchlist_limit').eq('id', 1).maybeSingle(),
  ])
  if (p.error) return NextResponse.json({ plans: [], free: null }, { headers: { 'Cache-Control': 'no-store' } })
  // Clients see the NGN plans (billing source of truth); another currency is
  // listed only when no NGN plan exists for its tier and period (same rule as
  // client_premium_info).
  type P = { tier: string | null; billing_period: string | null; billing_interval: string; currency: string }
  const all = (p.data || []) as P[]
  const per = (x: P) => x.billing_period || x.billing_interval
  const plans = all.filter(x => x.currency === 'NGN' || !all.some(u => u.currency === 'NGN' && u.tier === x.tier && per(u) === per(x)))
  return NextResponse.json({ plans, free: s.data ? { automations: s.data.free_automation_limit, watchlist: s.data.free_watchlist_limit } : null },
    { headers: { 'Cache-Control': 'no-store' } })
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Public pricing: enabled plans and the free limits. No payment destinations
// or provider identifiers are included.
export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [p, s] = await Promise.all([
    sb.from('premium_plans').select('id, name, tier, billing_interval, billing_period, price, promo_price, promo_label, currency, description, features, highlighted, sort_order').eq('enabled', true).order('sort_order').order('price'),
    sb.from('premium_settings').select('free_automation_limit, free_watchlist_limit').eq('id', 1).maybeSingle(),
  ])
  if (p.error) return NextResponse.json({ plans: [], free: null }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ plans: p.data || [], free: s.data ? { automations: s.data.free_automation_limit, watchlist: s.data.free_watchlist_limit } : null },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}

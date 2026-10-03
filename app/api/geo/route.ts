import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { visitorCountry } from '@/lib/payments'
import { currencyForCountry, parseCurrencyConfig } from '@/lib/currency'

// Display currency for this visitor: IP country (set by the hosting platform)
// mapped through the admin's currency settings. DISPLAY ONLY: checkout
// eligibility is decided separately by the database (Nigeria only).
export async function GET(request: NextRequest) {
  const country = visitorCountry(request)
  const { url, anonKey } = getSupabaseEnv()
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await sb.from('premium_settings').select('currency_config').eq('id', 1).maybeSingle()
  const config = parseCurrencyConfig(data?.currency_config)
  return NextResponse.json({ country, currency: currencyForCountry(country, config), source: country ? 'ip' : 'fallback', config },
    { headers: { 'Cache-Control': 'private, no-store' } })
}

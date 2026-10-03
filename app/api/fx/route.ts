import { NextResponse } from 'next/server'
import { fxRates } from '@/lib/fx'

// Public display rates, USD-based ({ rates: { NGN, GBP, … } }); `rate` is NGN
// per USD for older callers. { rate: null } when no reliable rate exists.
export async function GET() {
  const fx = await fxRates()
  return NextResponse.json(fx ? { pair: 'USD/NGN', rate: fx.rates.NGN, ...fx } : { pair: 'USD/NGN', rate: null, rates: {} },
    { headers: { 'Cache-Control': fx && !fx.stale ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store' } })
}

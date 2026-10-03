import { NextResponse } from 'next/server'
import { usdNgnRate } from '@/lib/fx'

// Public USD/NGN display rate. { rate: null } when no reliable rate is available.
export async function GET() {
  const fx = await usdNgnRate()
  return NextResponse.json(fx ? { pair: 'USD/NGN', ...fx } : { pair: 'USD/NGN', rate: null },
    { headers: { 'Cache-Control': fx ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store' } })
}

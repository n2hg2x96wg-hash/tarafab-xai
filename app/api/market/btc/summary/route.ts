import { NextResponse } from 'next/server'
import { getSummary, SUMMARY_TTL } from '@/lib/market'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const summary = await getSummary()
    return NextResponse.json(
      { summary, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': `public, s-maxage=${SUMMARY_TTL}, stale-while-revalidate=${SUMMARY_TTL}` } },
    )
  } catch (e) {
    console.error('market summary failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Market data is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}

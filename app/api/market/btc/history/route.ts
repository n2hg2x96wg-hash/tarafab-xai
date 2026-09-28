import { NextRequest, NextResponse } from 'next/server'
import { getHistory, HISTORY_RANGES, HISTORY_TTL, type HistoryRange } from '@/lib/market'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') || '30'
  if (!HISTORY_RANGES.includes(range as HistoryRange)) {
    return NextResponse.json({ error: 'Unknown range' }, { status: 400 })
  }
  try {
    const history = await getHistory(range as HistoryRange)
    const ttl = HISTORY_TTL[range as HistoryRange]
    return NextResponse.json(
      { history, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` } },
    )
  } catch (e) {
    console.error(`market history (${range}d) failed:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Price history is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}

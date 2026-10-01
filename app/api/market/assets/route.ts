import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ASSETS, quoteAsset, type Asset } from '@/lib/market-assets'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.from('market_assets').select('*').eq('enabled', true).order('display_order')
  const assets = (data?.length ? data : DEFAULT_ASSETS) as Asset[]
  const quotes = await Promise.all(assets.map(async asset => ({ asset, quote: await quoteAsset(asset) })))
  return NextResponse.json({ assets: quotes }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ASSETS, quoteAsset, type Asset } from '@/lib/market-assets'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase.from('market_assets').select('*').eq('enabled', true).order('display_order')
  if (error) console.error('Market asset configuration could not be loaded:', error)
  const assets = (data?.length ? data : DEFAULT_ASSETS) as Asset[]
  const quotes = await Promise.all(assets.map(async asset => {
    const quote = await quoteAsset(asset)
    return {
      asset: { ...asset, automation_enabled: Boolean(asset.id && asset.automation_enabled !== false && quote.price !== null && quote.status !== 'unavailable') },
      quote,
    }
  }))
  return NextResponse.json({ assets: quotes }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } })
}

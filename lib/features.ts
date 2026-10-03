import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type FeatureState = 'enabled' | 'disabled' | 'premium' | 'coming_soon' | 'unavailable' | 'admin_only'
export type FeatureKey = 'automations' | 'premium' | 'wallet_transfer' | 'portfolio_analytics'
  | 'markets' | 'charts' | 'watchlist' | 'portfolio' | 'investments' | 'wallet' | 'deposits' | 'withdrawals'
  | 'activity' | 'verification' | 'announcements' | 'support' | 'trading_status'

// Server-side gate used by API routes before an action. 'premium' features
// are allowed here; the Premium entitlement itself is checked by the
// database function that performs the action.
export async function featureBlocked(supabase: SupabaseClient, key: FeatureKey) {
  const { data, error } = await supabase.rpc('feature_state', { p_key: key })
  if (error) return null // fail open only to the existing behaviour; the action's own checks still apply
  const state = String(data) as FeatureState
  if (state === 'enabled' || state === 'premium') return null
  const msg = state === 'coming_soon' ? 'This feature is coming soon.' : 'This feature is not available right now.'
  return NextResponse.json({ error: msg, code: `feature_${state}` }, { status: 403 })
}

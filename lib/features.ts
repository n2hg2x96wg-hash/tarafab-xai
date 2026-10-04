import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type FeatureState = 'enabled' | 'disabled' | 'premium' | 'coming_soon' | 'unavailable' | 'admin_only'
export type FeatureKey = 'automations' | 'premium' | 'wallet_transfer' | 'portfolio_analytics'
  | 'markets' | 'charts' | 'watchlist' | 'portfolio' | 'investments' | 'wallet' | 'deposits' | 'withdrawals'
  | 'activity' | 'verification' | 'announcements' | 'support' | 'trading_status' | 'live_chat'

// Server-side gate used by API routes before an action. 'premium' features
// are allowed here; the Premium entitlement itself is checked by the
// database function that performs the action.
export async function featureBlocked(supabase: SupabaseClient, key: FeatureKey) {
  const { data, error } = await supabase.rpc('feature_state', { p_key: key })
  // Fail closed: if the state cannot be read, the action is refused.
  if (error) return NextResponse.json({ error: 'This feature is temporarily unavailable. Please try again.', code: 'FEATURE_UNAVAILABLE' }, { status: 503 })
  const state = String(data) as FeatureState
  if (state === 'enabled' || state === 'premium') return null
  const msg = state === 'coming_soon' ? 'This feature is coming soon.' : 'This feature is not available right now.'
  return NextResponse.json({ error: msg, code: state === 'coming_soon' ? 'FEATURE_COMING_SOON' : 'FEATURE_DISABLED' }, { status: 403 })
}

export const isHiddenState = (s: string | null | undefined) => s === 'disabled' || s === 'unavailable' || s === 'admin_only'

// Server-side read of one feature for public routes (no user session).
export async function featureHidden(supabase: SupabaseClient, key: FeatureKey) {
  const { data, error } = await supabase.rpc('feature_state', { p_key: key })
  return error ? true : isHiddenState(String(data))
}

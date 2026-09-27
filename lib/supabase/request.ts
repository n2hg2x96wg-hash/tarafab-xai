import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from './env'

// A Supabase client that acts as the signed-in caller, so database rules
// and auth.uid() apply to every query it makes.
export function clientForRequest(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { token: '', supabase: null }
  const { url, anonKey } = getSupabaseEnv()
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { token, supabase }
}

export const unauthorized = () => NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

export function dbError(err: { message?: string; code?: string } | null) {
  const msg = err?.message || 'Something went wrong'
  const status = err?.code === 'PGRST301' || /jwt/i.test(msg) ? 401 : 400
  return NextResponse.json({ error: status === 401 ? 'Please sign in again.' : msg }, { status })
}

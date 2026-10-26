import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { noStoreFetch } from '@/lib/supabase/noStore'
import { getSupabaseEnv } from '@/lib/supabase/env'

// Wrong-password limit for sign-in: SIGNIN_MAX_FAILS wrong attempts in a row
// pause sign-in for SIGNIN_PAUSE_S seconds. Counted in the database
// (signin_failures, see migration 202611280001) per email + visitor address
// pair, so every server instance counts together and nobody can lock another
// person out from elsewhere. Only a keyed digest of the pair is stored.
// Server only. If the database cannot be reached (or the functions are not
// installed yet) every call returns null and sign-in works as before; the
// per-email and per-address limits in the route still apply.
export const SIGNIN_MAX_FAILS = 5
export const SIGNIN_PAUSE_S = 5 * 60

type State = { fails: number; lockedUntil: number | null }

function db() {
  const { url, serviceKey } = getSupabaseEnv()
  if (!url || !serviceKey) return null
  return { key: serviceKey, client: createClient(url, serviceKey, { global: { fetch: noStoreFetch }, auth: { persistSession: false, autoRefreshToken: false } }) }
}
const digestOf = (key: string, email: string, ip: string) =>
  createHmac('sha256', key).update(`signin_pair:${email.toLowerCase()}:${ip}`).digest('hex')
const toState = (row: { fails?: number; locked_until?: string | null } | undefined): State =>
  ({ fails: Number(row?.fails) || 0, lockedUntil: row?.locked_until ? Date.parse(row.locked_until) : null })

async function call(fn: string, args: (digest: string) => Record<string, unknown>, email: string, ip: string): Promise<State | null> {
  const d = db()
  if (!d) return null
  try {
    const { data, error } = await d.client.rpc(fn, args(digestOf(d.key, email, ip)))
    if (error) { console.error(`${fn} failed:`, error.message); return null }
    return toState(Array.isArray(data) ? data[0] : undefined)
  } catch (e) { console.error(`${fn} failed:`, e instanceof Error ? e.message : e); return null }
}

/** Wrong attempts so far and, while paused, when sign-in opens again. */
export const attemptState = (email: string, ip: string) =>
  call('signin_attempt_state', p_digest => ({ p_digest }), email, ip)

/** Records one wrong password; the SIGNIN_MAX_FAILS-th starts the pause. */
export const recordFailure = (email: string, ip: string) =>
  call('signin_record_failure', p_digest => ({ p_digest, p_max: SIGNIN_MAX_FAILS, p_lock_s: SIGNIN_PAUSE_S }), email, ip)

/** A successful sign-in starts the count again. */
export async function clearFailures(email: string, ip: string) {
  const d = db()
  if (!d) return
  try {
    const { error } = await d.client.rpc('signin_clear_failures', { p_digest: digestOf(d.key, email, ip) })
    if (error) console.error('signin_clear_failures failed:', error.message)
  } catch (e) { console.error('signin_clear_failures failed:', e instanceof Error ? e.message : e) }
}

/** Seconds until a pause ends (rounded up, at least 1). */
export const secondsLeft = (lockedUntil: number) => Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000))

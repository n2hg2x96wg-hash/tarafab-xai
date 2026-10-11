// Password recovery on our own domain.
//
// The branded reset email links to /auth/confirm with the one-time token hash
// in the address fragment (#token_hash=…&type=recovery). A fragment is never
// sent to a server, so the token does not reach request logs, and the page
// removes it from the address bar before anything else can read it. The
// token is only verified (with the existing Supabase client) when the person
// presses Continue, so email link scanners that open links cannot use it up.
//
// A successful verification, or Supabase's own recovery redirect
// (#…&type=recovery), marks this browser tab as being in password recovery.
// The reset page only offers a new password while that mark is present, so
// an ordinary signed-in session cannot change the password there without
// going through a recovery link.

export const RECOVERY_FLAG = 'tarafab.recovery'
const MAX_AGE_MS = 60 * 60 * 1000 // Supabase recovery links last one hour by default.

export type RecoveryParams = { tokenHash: string; type: 'recovery' }

// Reads the token from the fragment or, for links built from Supabase's
// documented template, the query string. Anything that is not a recovery
// token of the expected shape is rejected without contacting Supabase.
export function readRecoveryParams(search: string, hash: string): RecoveryParams | null {
  for (const raw of [hash.replace(/^#/, ''), search.replace(/^\?/, '')]) {
    if (!raw) continue
    const p = new URLSearchParams(raw)
    const tokenHash = p.get('token_hash') || ''
    if (!tokenHash) continue
    if (p.get('type') !== 'recovery' || !/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash)) return null
    return { tokenHash, type: 'recovery' }
  }
  return null
}

export function markRecovery() {
  try { sessionStorage.setItem(RECOVERY_FLAG, String(Date.now())) } catch { /* storage blocked */ }
}

export function inRecovery(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RECOVERY_FLAG))
    return at > 0 && Date.now() - at < MAX_AGE_MS
  } catch { return false }
}

export function clearRecovery() {
  try { sessionStorage.removeItem(RECOVERY_FLAG) } catch { /* storage blocked */ }
}

// Public values (anon key is shipped to browsers by design). Used when the
// deployed env vars are missing or malformed, e.g. corrupted by copy-paste.
export const FALLBACK_SUPABASE_URL = 'https://jdskpqjwmaeurxspipyv.supabase.co'
export const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impkc2twcWp3bWFldXJ4c3BpcHl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMTM3MjAsImV4cCI6MjEwNTg4OTcyMH0.WjBpl6Hisl7LjDuS-8uiPrzt3o8_7w4CAX1EGtm0BOo'

const PROJECT_REF = 'jdskpqjwmaeurxspipyv'

const strip = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim()

function decodeBase64Url(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8')
}

function jwtMatches(key: string, role: 'anon' | 'service_role') {
  const parts = key.split('.')
  if (parts.length !== 3 || !parts.every(p => /^[\w-]+$/.test(p))) return false
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    return payload.ref === PROJECT_REF && payload.role === role
  } catch {
    return false
  }
}

export function resolveSupabaseUrl(raw: string | undefined) {
  const url = strip((raw || '').replace(/\/+$/, ''))
  return url.includes(PROJECT_REF) && /^https:\/\/[\w.-]+$/.test(url) ? url : FALLBACK_SUPABASE_URL
}

// The env value can't be signature-checked here, and a damaged copy was
// rejected by Supabase in production, so the verified public key always wins.
// Update FALLBACK_SUPABASE_ANON_KEY if the project's keys are ever rotated.
export function resolveAnonKey(_raw: string | undefined) {
  return FALLBACK_SUPABASE_ANON_KEY
}

// A Supabase access token must be a compact JWS (three dot-separated parts).
// New-format API keys (sb_secret_… / sb_publishable_…) are NOT JWTs: Supabase
// Storage parses the Authorization bearer as a JWT and rejects anything else
// with "Invalid Compact JWS", so such a key must never be sent as a bearer.
export function isJwt(value: string) {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)
}

export function getSupabaseEnv() {
  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const rawService = strip(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const serviceKey = jwtMatches(rawService, 'service_role') || /^sb_secret_[\w-]+$/.test(rawService) ? rawService : ''
  // serviceKey may be a legacy JWT or a new sb_secret_ key. Only pass it to
  // supabase-js as the client key for PostgREST work, never for Storage, and
  // never as an Authorization bearer (see isJwt above).
  return { url, anonKey, serviceKey }
}

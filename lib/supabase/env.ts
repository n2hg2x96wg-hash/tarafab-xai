const strip = (s: string) => s.replace(/[^\x20-\x7E]/g, '')

export function getSupabaseEnv() {
  const url = strip((process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''))
  const anonKey = strip(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  const serviceKey = strip(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  return { url, anonKey, serviceKey }
}

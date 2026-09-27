import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { resolveAnonKey, resolveSupabaseUrl } from './env'

const safeStorage = {
  getItem: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch {} },
}

let _client: ReturnType<typeof createSupabaseClient> | null = null

export const createClient = () => {
  if (!_client) {
    const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const key = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    _client = createSupabaseClient(url, key, { auth: { storage: safeStorage } })
  }
  return _client
}

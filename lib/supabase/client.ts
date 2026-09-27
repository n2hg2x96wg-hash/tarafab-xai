import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const safeStorage = {
  getItem: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch {} },
}

let _client: ReturnType<typeof createSupabaseClient> | null = null

export const createClient = () => {
  if (!_client) {
    _client = createSupabaseClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { storage: safeStorage } }
    )
  }
  return _client
}

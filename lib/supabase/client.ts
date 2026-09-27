import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createSupabaseClient> | null = null

export const createClient = () => {
  if (!_client) {
    _client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

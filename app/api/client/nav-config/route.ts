import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Which optional dashboard sections are hidden. Readable by any signed-in
// user; the database function returns this one setting only.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const { data, error } = await supabase.rpc('client_nav_config')
  if (error) return dbError(error)
  return NextResponse.json({ config: data })
}

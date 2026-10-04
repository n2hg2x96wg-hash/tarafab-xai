import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'

// Short-lived link to a private receipt. Storage rules only let admins
// (or the owning client) read the file.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }

  const path = request.nextUrl.searchParams.get('path') || ''
  if (!/^[0-9a-f-]{36}\/[\w.-]+$/i.test(path)) return NextResponse.json({ error: 'Invalid receipt path' }, { status: 400 })

  const { data: isAdmin, error: roleErr } = await supabase.rpc('is_admin')
  if (roleErr) return dbError(roleErr)
  if (!isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const { data, error } = await supabase.storage.from('deposit-receipts').createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Receipt not found' }, { status: 404 })
  return NextResponse.json({ url: data.signedUrl })
}

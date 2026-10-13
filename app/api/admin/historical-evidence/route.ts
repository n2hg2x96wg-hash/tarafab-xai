import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'
import { uploadToBucket } from '@/lib/supabase/uploadToBucket'

// Supporting evidence for a historical investment record. The private bucket
// only accepts files from admins, stored under the uploading admin's id, and
// only admins can read them (storage policies), so a client never sees them.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  return uploadToBucket(request, 'historical-evidence', 'historical-evidence')
}

// Short-lived link to view one evidence file.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  const path = request.nextUrl.searchParams.get('path') || ''
  if (!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,100}\.(pdf|jpg|png|webp)$/.test(path)) return NextResponse.json({ error: 'Invalid evidence path' }, { status: 400 })
  const { data, error } = await supabase.storage.from('historical-evidence').createSignedUrl(path, 300)
  if (error || !data) return error ? dbError({ message: 'Evidence file not found', code: 'P0002' }) : NextResponse.json({ error: 'Evidence file not found' }, { status: 404 })
  return NextResponse.json({ url: data.signedUrl })
}

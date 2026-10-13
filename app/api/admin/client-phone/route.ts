import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { requireAdmin } from '@/lib/adminGuard'
import { normalizePhone } from '@/lib/phone'

// Admin: set, change or clear a client's contact number, with a reason. The
// database function checks admin rights again, writes only the phone fields
// and records the change in the audit log. Nothing is sent to the number.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const denied = await requireAdmin(supabase, request); if (denied) return denied }
  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const userId = typeof b.user_id === 'string' && UUID.test(b.user_id) ? b.user_id : ''
  if (!userId) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 })
  const reason = typeof b.reason === 'string' ? b.reason.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  if (reason.length < 3) return NextResponse.json({ error: 'Enter a reason (at least 3 characters).' }, { status: 400 })
  const clear = b.clear === true
  let phone = '', country = ''
  if (!clear) {
    const ph = normalizePhone(typeof b.phone === 'string' ? b.phone : '', typeof b.phone_country === 'string' ? b.phone_country.toUpperCase() : '')
    if (!ph.ok) {
      const error = ph.error === 'missing' ? 'Enter the phone number.' : ph.error === 'country' ? 'Choose the country calling code.' : 'Enter a valid phone number for the selected country.'
      return NextResponse.json({ error, field: 'phone' }, { status: 400 })
    }
    phone = ph.e164; country = ph.country
  }
  const { data, error } = await supabase.rpc('admin_set_client_phone', { p_user_id: userId, p_phone: phone, p_country: country || null, p_reason: reason })
  if (error) return dbError(error)
  return NextResponse.json(data)
}

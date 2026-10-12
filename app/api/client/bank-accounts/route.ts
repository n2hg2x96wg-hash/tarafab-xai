import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { clientIp, rateLimited } from '@/lib/rateLimit'
import { limitUser } from '@/lib/userRateLimit'
import { bankCountry, pickDetails, validateBankDetails } from '@/lib/bankRoutes'

// The caller's own saved bank destinations, masked. Row-level security
// returns only the caller's rows and only masked columns are readable: the
// encrypted details and the fingerprint cannot be selected at all. Saving,
// renaming and removing go through database functions that act on
// auth.uid()'s rows only and validate every field again.
const COLUMNS = 'id, label, country, currency, route, holder_name, bank_name, account_last4, name_check, status, review_note, created_at, updated_at'
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const [ctx, list] = await Promise.all([
    supabase.rpc('client_bank_context'),
    supabase.from('client_bank_accounts').select(COLUMNS).neq('status', 'removed').order('created_at', { ascending: true }).limit(20),
  ])
  if (ctx.error) return dbError(ctx.error)
  if (list.error) return dbError(list.error)
  return NextResponse.json({ context: ctx.data, accounts: list.data || [] })
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  const limited = rateLimited(`bank-accounts:${clientIp(request)}`, 30, 10 * 60_000)
  if (limited) return limited
  { const l = await limitUser(supabase, 'bank_accounts', 20, 600); if (l) return l }
  // Bank destinations exist only for withdrawals: switched off with them.
  { const blocked = await featureBlocked(supabase, 'withdrawals'); if (blocked) return blocked }
  const { data: off } = await supabase.rpc('client_nav_is_hidden', { p_section: 'withdraw' })
  if (off === true) return NextResponse.json({ error: 'This feature is currently unavailable. Please contact support.' }, { status: 403 })

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  if (b.action === 'save') {
    const country = bankCountry(typeof b.country === 'string' ? b.country : '')
    if (!country) return NextResponse.json({ error: 'Bank withdrawals to this country are not supported yet.', fields: { country: 'Bank withdrawals to this country are not supported yet.' } }, { status: 400 })
    const holder = text(b.holder_name, 120)
    const bank = text(b.bank_name, 120)
    const label = text(b.label, 41)
    const raw = (b.details && typeof b.details === 'object') ? b.details as Record<string, unknown> : {}
    const details = pickDetails(country, raw)
    const fields: Record<string, string> = { ...validateBankDetails(country, details) }
    if (holder.length < 2) fields.holder_name = 'Enter the account holder\'s full legal name.'
    if (bank.length < 2) fields.bank_name = 'Enter the bank name.'
    if (label.length > 40) fields.label = 'Use 40 characters or fewer for the account nickname.'
    const replaceId = typeof b.replace_id === 'string' && UUID.test(b.replace_id) ? b.replace_id : null
    if (Object.keys(fields).length) return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 })
    const { data, error } = await supabase.rpc('client_save_bank_account', {
      p_country: country.code, p_holder_name: holder, p_bank_name: bank, p_details: details,
      p_label: label || null, p_replace_id: replaceId,
    })
    if (error) return dbError(error)
    return NextResponse.json({ account: data })
  }
  if (b.action === 'rename') {
    const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : ''
    if (!id) return NextResponse.json({ error: 'That bank account could not be found.' }, { status: 400 })
    const label = text(b.label, 41)
    if (label.length > 40) return NextResponse.json({ error: 'Use 40 characters or fewer for the account nickname.' }, { status: 400 })
    const { data, error } = await supabase.rpc('client_rename_bank_account', { p_id: id, p_label: label || null })
    if (error) return dbError(error)
    return NextResponse.json({ account: data })
  }
  if (b.action === 'remove') {
    const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : ''
    if (!id) return NextResponse.json({ error: 'That bank account could not be found.' }, { status: 400 })
    const { error } = await supabase.rpc('client_remove_bank_account', { p_id: id })
    if (error) return dbError(error)
    return NextResponse.json({ removed: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

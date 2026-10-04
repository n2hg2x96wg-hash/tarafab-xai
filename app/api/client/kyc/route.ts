import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'
import { limitUser } from '@/lib/userRateLimit'

type KycStatus = {
  status: string
  // Whether a real submission exists. A profile can carry a verification
  // status set before the KYC form existed, which is not a submission.
  has_submission: boolean
  profile_status: string
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  document_type: string | null
  full_legal_name: string | null
}

// The client's own verification state. Never exposes another client's data:
// the database function reads it from the caller's own session.
export async function GET(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  const { data, error } = await supabase.rpc('client_kyc_status')
  if (error) return dbError(error)
  return NextResponse.json({ kyc: data as KycStatus })
}

// Submits a verification request. It only ever records the request as pending:
// a client cannot verify themselves, that is an admin action.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  { const limited = await limitUser(supabase, 'kyc', 10, 3600); if (limited) return limited }
  // Switched off in Admin → Feature controls: refused here too, not only hidden.
  { const blocked = await featureBlocked(supabase, 'verification'); if (blocked) return blocked }

  try {
    const body = await request.json() as {
      full_legal_name?: string
      document_type?: string
      date_of_birth?: string
      country?: string
      address?: string
      document_number?: string
      document_path?: string
      selfie_path?: string
    }
    if (!body.full_legal_name?.trim()) return NextResponse.json({ error: 'Your full legal name is required.' }, { status: 400 })
    if (!body.document_type) return NextResponse.json({ error: 'Please choose a document type.' }, { status: 400 })
    if (!body.document_path) return NextResponse.json({ error: 'Please attach a photo of your document.' }, { status: 400 })

    const { data, error } = await supabase.rpc('client_submit_kyc', {
      p_full_legal_name: body.full_legal_name.trim(),
      p_document_type: body.document_type,
      p_date_of_birth: body.date_of_birth || null,
      p_country: body.country?.trim() || null,
      p_address: body.address?.trim() || null,
      p_document_number: body.document_number?.trim() || null,
      p_document_path: body.document_path,
      p_selfie_path: body.selfie_path || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ submission: { id: data.id, status: data.status, submitted_at: data.submitted_at } })
  } catch (e: unknown) {
    console.error('client kyc submit failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Your verification request could not be submitted. Please try again.' }, { status: 500 })
  }
}

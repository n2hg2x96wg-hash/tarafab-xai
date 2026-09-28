import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

// Verifies or rejects a verification request. The database function checks the
// caller is an admin, records who acted and when, and only then changes the
// client's verification status.
export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const { submission_id, action, reason } = await request.json() as {
      submission_id: string; action: 'review' | 'verify' | 'reject'; reason?: string
    }
    if (!submission_id || !['review', 'verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'submission_id and action (review/verify/reject) required' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('admin_review_kyc', {
      p_submission_id: submission_id,
      p_action: action,
      p_reason: reason?.trim() || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ success: true, status: data })
  } catch (e: unknown) {
    console.error('admin review kyc failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'The review could not be saved. Please try again.' }, { status: 500 })
  }
}

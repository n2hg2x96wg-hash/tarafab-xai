import { NextRequest } from 'next/server'
import { uploadToBucket } from '@/lib/supabase/uploadToBucket'

// Identity documents are private and live in their own bucket, separate from
// deposit receipts. Same rules: stored under the client's own user id, readable
// only by that client and admins.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  return uploadToBucket(request, 'kyc-documents', 'upload-kyc-doc')
}

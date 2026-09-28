import { NextRequest } from 'next/server'
import { uploadToBucket } from '@/lib/supabase/uploadToBucket'

// Receipts are private. The file is stored under the client's own user id, so
// the storage rules let that client and admins read it and nobody else.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  return uploadToBucket(request, 'deposit-receipts', 'upload-receipt')
}

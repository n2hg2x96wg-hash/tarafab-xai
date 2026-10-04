import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv, isJwt } from '@/lib/supabase/env'
import { rateLimited } from '@/lib/rateLimit'
import { limitUser } from '@/lib/userRateLimit'

// Shared handler for the private files a client uploads: deposit receipts and
// identity documents. Both buckets use the same rules, so the logic lives here
// once and each route supplies its bucket.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // matches the bucket's own limit

// The browser-reported type can be wrong or spoofed, so the first bytes of
// the file must match it too.
function contentMatches(type: string, b: Buffer) {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (type === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === 'image/webp') return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  if (type === 'application/pdf') return b.subarray(0, 5).toString('latin1') === '%PDF-'
  return false
}

export async function uploadToBucket(request: NextRequest, bucket: string, limitName: string) {
  const { url, anonKey } = getSupabaseEnv()
  if (!url || !anonKey) {
    console.error(`${limitName}: Supabase URL or anon key missing`)
    return NextResponse.json({ error: 'We could not accept the file right now. Please try again.' }, { status: 500 })
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  // A malformed token would otherwise reach Supabase and come back as a raw
  // library error ("Invalid Compact JWS"); tell the client to sign in instead.
  if (!token || !isJwt(token)) {
    if (token) console.error(`${limitName}: access token is not a compact JWS`)
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }

  try {
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const limited = rateLimited(`${limitName}:${user.id}`, 10, 10 * 60_000)
    if (limited) return limited

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 })

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Files must be JPG, PNG, WEBP or PDF.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'The file is larger than 5 MB. Please choose a smaller one.' }, { status: 400 })
    }

    // Upload as the signed-in client, never with the service key: the storage
    // policy already lets a client write into their own folder, and the user's
    // access token is a real JWT. A new-format sb_secret_ key is not a JWT and
    // Supabase Storage rejects it as "Invalid Compact JWS".
    const storageClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Shared across server instances (the in-memory limit above is per instance).
    { const limited = await limitUser(storageClient, 'upload', 20, 600); if (limited) return limited }

    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[file.type]
    // A client-supplied key names the file, so retrying the same upload after
    // a dropped connection reuses one file instead of storing a duplicate.
    const key = String(formData.get('key') || '')
    const name = /^[A-Za-z0-9_-]{8,100}$/.test(key) ? key : `${Date.now()}`
    const filePath = `${user.id}/${name}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!contentMatches(file.type, buffer)) {
      return NextResponse.json({ error: 'This file does not look like a valid JPG, PNG, WEBP or PDF.' }, { status: 400 })
    }

    const { error: uploadErr } = await storageClient.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      const msg = (uploadErr as { message?: string }).message || ''
      // Same key uploaded before (a retry): the file is already stored.
      if (/already exists|duplicate/i.test(msg)) return NextResponse.json({ path: filePath })
      // Keep the technical detail in the server logs, show the client plain words.
      console.error(`${limitName}: storage upload failed:`, msg)
      if (/jws|jwt|token|unauthor/i.test(msg)) {
        return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
      }
      return NextResponse.json({ error: 'We could not upload the file right now. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ path: filePath })
  } catch (e: unknown) {
    console.error(`${limitName}: unexpected failure:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'We could not upload the file right now. Please try again.' }, { status: 500 })
  }
}

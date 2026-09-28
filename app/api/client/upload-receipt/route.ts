import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { rateLimited } from '@/lib/rateLimit'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// The browser-reported type can be wrong or spoofed, so the first bytes of
// the file must match it too.
function contentMatches(type: string, b: Buffer) {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (type === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === 'image/webp') return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  if (type === 'application/pdf') return b.subarray(0, 5).toString('latin1') === '%PDF-'
  return false
}

export async function POST(request: NextRequest) {
  const { url, anonKey, serviceKey } = getSupabaseEnv()
  if (!url || (!serviceKey && !anonKey)) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const authClient = createClient(url, anonKey || serviceKey)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    const limited = rateLimited(`upload:${user.id}`, 10, 10 * 60_000)
    if (limited) return limited

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Allowed: JPG, PNG, WEBP, PDF' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB' }, { status: 400 })
    }

    const storageClient = serviceKey
      ? createClient(url, serviceKey)
      : createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })

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
      .from('deposit-receipts')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      const msg = (uploadErr as { message: string }).message
      // Same key uploaded before (a retry): the file is already stored.
      if (/already exists|duplicate/i.test(msg)) return NextResponse.json({ path: filePath })
      if (msg.includes('not found') || msg.includes('Bucket')) {
        return NextResponse.json({ error: 'Storage not configured. Please contact support.' }, { status: 500 })
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ path: filePath })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

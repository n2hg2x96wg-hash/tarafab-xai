import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/env'

export async function POST(request: NextRequest) {
  const { url, anonKey: key } = getSupabaseEnv()
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createClient(url, key)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const body = await request.json()
    const { amount, method, receipt_path, notes } = body as {
      amount: number
      method: string
      receipt_path?: string
      notes?: string
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }
    if (!method?.trim()) {
      return NextResponse.json({ error: 'Deposit method is required' }, { status: 400 })
    }

    const { serviceKey } = getSupabaseEnv()
    const writeClient = serviceKey
      ? createClient(url, serviceKey)
      : createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })

    const reference = `DEP-${Date.now().toString(36).toUpperCase()}`

    const { data: tx, error: insertErr } = await writeClient
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'deposit',
        method: method.trim(),
        amount,
        status: 'pending_review',
        reference,
        notes: [
          notes?.trim() || '',
          receipt_path ? `receipt:${receipt_path}` : '',
        ].filter(Boolean).join(' | ') || null,
      })
      .select('id, reference, status, created_at')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: (insertErr as { message: string }).message }, { status: 500 })
    }

    return NextResponse.json({ deposit: tx })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { featureBlocked } from '@/lib/features'
import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, idempotencyKey, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()
  // Switched off in Admin → Feature controls: refused here too, not only hidden.
  { const blocked = await featureBlocked(supabase, 'deposits'); if (blocked) return blocked }

  // Hiding this section in the admin menu settings also switches it off here,
  // so it cannot be used by calling the API directly.
  const { data: off } = await supabase.rpc('client_nav_is_hidden', { p_section: 'deposit' })
  if (off === true) return NextResponse.json({ error: 'This feature is currently unavailable. Please contact support.' }, { status: 403 })

  try {
    const body = await request.json() as {
      amount: number
      method: string
      receipt_path?: string
      notes?: string
      idempotency_key?: string
    }
    const { amount, method, receipt_path, notes } = body
    if (typeof amount !== 'number' || !(amount > 0)) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    if (!method?.trim()) return NextResponse.json({ error: 'Deposit method is required' }, { status: 400 })

    // Ethereum: validated against the admin's ETH receiving address; recorded
    // as pending_review (never credited until an admin verifies it on-chain).
    if (method.trim() === 'ethereum') {
      const e = body as { eth_amount?: unknown; tx_hash?: unknown; from_address?: unknown }
      const { data, error } = await supabase.rpc('client_submit_eth_deposit', {
        p_amount: amount, p_eth_amount: Number(e.eth_amount), p_tx_hash: String(e.tx_hash ?? ''), p_from_address: String(e.from_address ?? ''),
        p_notes: notes?.trim() || null, p_idempotency_key: idempotencyKey(request, body),
      })
      if (error) return dbError(error)
      return NextResponse.json({ deposit: { id: data.id, reference: data.reference, status: data.status, created_at: data.created_at } })
    }

    // Records the deposit as pending_review. Balances change only when an admin approves it.
    const { data, error } = await supabase.rpc('client_submit_deposit', {
      p_amount: amount,
      p_method: method.trim(),
      p_receipt_path: receipt_path || null,
      p_notes: notes?.trim() || null,
      p_idempotency_key: idempotencyKey(request, body),
    })
    if (error) return dbError(error)
    return NextResponse.json({ deposit: { id: data.id, reference: data.reference, status: data.status, created_at: data.created_at } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

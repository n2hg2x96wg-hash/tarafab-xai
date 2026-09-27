import { NextRequest, NextResponse } from 'next/server'
import { clientForRequest, dbError, unauthorized } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  const { supabase } = clientForRequest(request)
  if (!supabase) return unauthorized()

  try {
    const { amount, method, receipt_path, notes } = await request.json() as {
      amount: number
      method: string
      receipt_path?: string
      notes?: string
    }
    if (typeof amount !== 'number' || !(amount > 0)) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    if (!method?.trim()) return NextResponse.json({ error: 'Deposit method is required' }, { status: 400 })

    // Records the deposit as pending_review. Balances change only when an admin approves it.
    const { data, error } = await supabase.rpc('client_submit_deposit', {
      p_amount: amount,
      p_method: method.trim(),
      p_receipt_path: receipt_path || null,
      p_notes: notes?.trim() || null,
    })
    if (error) return dbError(error)
    return NextResponse.json({ deposit: { id: data.id, reference: data.reference, status: data.status, created_at: data.created_at } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

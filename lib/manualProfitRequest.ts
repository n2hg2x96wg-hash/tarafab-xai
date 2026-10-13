import { NextResponse } from 'next/server'

// Fields shared by the Manual Profit Credit and Debit requests. These checks
// only give early, clear messages: the database functions validate every
// field again and are the only place a balance is changed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVIDENCE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,100}\.(pdf|jpg|png|webp)$/
const text = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''

export type ManualProfitFields = {
  userId: string
  amount: string
  date: string
  description: string
  backdate: string | null
  tz: number
  reference: string | null
  evidence: string | null
  note: string | null
  exceptionAck: boolean
  exceptionBasis: string | null
  reverses: string | null
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const bad = (error: string) => ({ error: NextResponse.json({ error }, { status: 400 }) })

export function parseManualProfit(b: Record<string, unknown>): { fields: ManualProfitFields } | { error: NextResponse } {
  const userId = isUuid(b.user_id) ? b.user_id : ''
  if (!userId) return bad('Choose a client.')
  const amount = typeof b.amount === 'string' ? b.amount.trim() : ''
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return bad('Enter an amount greater than zero, with at most 2 decimal places.')
  const date = typeof b.effective_date === 'string' ? b.effective_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return bad('Choose an effective date.')
  // `reason` is the original name of the description field.
  const description = text(b.description ?? b.reason)
  if (description.length < 5) return bad('Enter a description (at least 5 characters).')
  if (description.length > 500) return bad('Keep the description under 500 characters.')
  const tz = Number(b.tz_offset_min)
  if (!Number.isInteger(tz) || tz < -840 || tz > 840) return bad('Invalid time zone.')
  const reference = text(b.external_reference) || null
  if (reference && reference.length > 120) return bad('The reference is too long.')
  const evidence = typeof b.evidence_path === 'string' && b.evidence_path ? b.evidence_path : null
  if (evidence && !EVIDENCE.test(evidence)) return bad('Invalid evidence file.')
  const note = typeof b.internal_note === 'string' && b.internal_note.trim() ? b.internal_note.trim() : null
  if (note && note.length > 1000) return bad('Keep the internal note under 1000 characters.')
  const reverses = text(b.reverses_reference) || null
  if (reverses && !/^[A-Z]{3}-[A-Z0-9]{4,20}$/i.test(reverses)) return bad('Enter a valid transaction reference.')
  return {
    fields: {
      userId, amount, date, description, tz, reference, evidence, note, reverses,
      backdate: text(b.backdate_reason) || null,
      exceptionAck: b.exception_ack === true,
      exceptionBasis: text(b.exception_basis) || null,
    },
  }
}

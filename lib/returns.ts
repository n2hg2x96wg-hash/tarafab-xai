// Exact money arithmetic for projected returns. Everything is done in integer
// cents / ten-thousandths of a percent, so results match the database's
// numeric arithmetic (round half up to 2 decimals) with no floating-point drift.
//
// Accounting rule (same as the database): principal = amount - entry fee, and
// a percentage return is computed on that principal.

export type ReturnTerms = { type: 'none' | 'fixed_rate' | 'fixed_amount'; ratePct?: number | string | null; amount?: number | string | null }

const toCents = (v: number | string) => Math.round(Number(v) * 100)
const cents = (c: number) => c / 100

/** Entry fee in cents for an investment amount and a fee fraction (0.01 = 1%). */
export function feeCents(amount: number | string, feeFraction: number | string) {
  // fraction has up to 4 decimals -> ten-thousandths
  return Math.round((toCents(amount) * Math.round(Number(feeFraction) * 10000)) / 10000)
}

export function projection(amount: number | string, feeFraction: number | string, terms: ReturnTerms) {
  const gross = toCents(amount)
  const fee = feeCents(amount, feeFraction)
  const principal = gross - fee
  let profit = 0
  if (terms.type === 'fixed_rate' && terms.ratePct != null && terms.ratePct !== '') {
    // rate has up to 4 decimals; profit = principal * rate / 100
    profit = Math.round((principal * Math.round(Number(terms.ratePct) * 10000)) / 1_000_000)
  } else if (terms.type === 'fixed_amount' && terms.amount != null && terms.amount !== '') {
    profit = toCents(terms.amount)
  }
  return { fee: cents(fee), principal: cents(principal), profit: cents(profit), total: cents(principal + profit) }
}

/** A return percentage the database will accept: numeric, 0..9999, up to 4 decimals. */
export function validRatePct(v: string | number) {
  const s = String(v).trim()
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return false
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 9999
}

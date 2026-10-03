// The client's investment figures, as returned by the database function
// client_investment_summary() (the single definition used by Overview,
// Portfolio and account summaries; see its migration for the status rules).
export type InvestmentSummary = {
  total_invested: number
  total_count: number
  active_principal: number
  active_count: number
  pending_principal: number
  pending_count: number
  completed_principal: number
  completed_count: number
  investment_profit: number
}

const KEYS: (keyof InvestmentSummary)[] = ['total_invested', 'total_count', 'active_principal', 'active_count', 'pending_principal', 'pending_count', 'completed_principal', 'completed_count', 'investment_profit']

// Accepts only a complete, numeric summary; anything else is "unavailable"
// (null) so a failed read is never shown as $0.00.
export function parseInvestmentSummary(v: unknown): InvestmentSummary | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const out = {} as InvestmentSummary
  for (const k of KEYS) {
    const n = Number(o[k])
    if (o[k] == null || !Number.isFinite(n)) return null
    out[k] = n
  }
  return out
}

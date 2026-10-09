// Shapes one stored transaction row for the client.
//
// - The effective (business) date becomes created_at; for a row whose date was
//   set by our team, updated_at is reported as the effective date too, so no
//   recording or correction time reaches the client.
// - `reason`: the reason the admin entered for a profit-balance adjustment.
//   admin_adjust_balance stores it in that same row's notes when it creates
//   the row, so every row carries its own reason (never another row's). Notes
//   of every other kind of transaction are never sent to the client.
export type StoredTxRow = {
  type: string; method?: string | null; notes?: string | null
  effective_at: string; created_at: string; updated_at: string
  [k: string]: unknown
}

export function toClientTx({ effective_at, created_at, updated_at, notes, ...t }: StoredTxRow) {
  return {
    ...t,
    ...(t.type === 'adjustment' && t.method === 'profit_balance' ? { reason: (notes || '').trim() || null } : {}),
    created_at: effective_at,
    updated_at: effective_at === created_at ? updated_at : effective_at,
  }
}

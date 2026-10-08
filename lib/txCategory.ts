// What a transaction MEANS to the client, decided by the business event that
// created it (transactions.source, set by the database — see the
// 202611130001_transaction_source migration), never by the sign of the amount
// or by "the balance went up".
//
//   admin_funding     → Deposit (an admin credited the spendable balance)
//   client_deposit    → Deposit
//   investment_profit → Profit (written by the investment-return workflow)
//   investment_principal → Investment
//   withdrawal / fee  → Withdrawal / Fee
//   admin_debit, balance_adjustment → Adjustment
//   profit_adjustment → Profit adjustment (an admin changed the profit balance
//                       directly; not an investment return)
//
// Rows without a source (none today; only possible for a future legacy import)
// fall back to their stored type. A bare 'adjustment' is never assumed to be
// profit — it is shown neutrally as an Adjustment.

export type TxCategory = 'deposit' | 'profit' | 'profit_adjustment' | 'investment' | 'withdrawal' | 'fee' | 'adjustment' | 'transfer' | 'other'

export type TxLike = { type: string; method?: string | null; direction?: string | null; source?: string | null }

export function txCategory(tx: TxLike): TxCategory {
  switch (tx.source) {
    case 'client_deposit': case 'admin_funding': return 'deposit'
    case 'investment_profit': return 'profit'
    case 'profit_adjustment': return 'profit_adjustment'
    case 'investment_principal': return 'investment'
    case 'withdrawal': return 'withdrawal'
    case 'fee': return 'fee'
    case 'admin_debit': case 'balance_adjustment': return 'adjustment'
    case 'transfer': return 'transfer'
  }
  switch (tx.type) {
    case 'deposit': return 'deposit'
    case 'return': return 'profit' // the investment-return type
    case 'investment': return 'investment'
    case 'withdrawal': return 'withdrawal'
    case 'fee': return 'fee'
    case 'adjustment': return 'adjustment'
    case 'transfer_in': case 'transfer_out': return 'transfer'
    default: return 'other'
  }
}

// Whether the row adds to (+) or takes from (−) the client's money, from the
// stored direction first and the event second. 0 = neither (e.g. the
// invested-balance side of an investment, already shown by its partner row).
export function txSign(tx: TxLike): 1 | -1 | 0 {
  if (tx.direction === 'credit') return 1
  if (tx.direction === 'debit') return -1
  const c = txCategory(tx)
  if (c === 'deposit' || c === 'profit') return 1
  if (c === 'withdrawal' || c === 'fee') return -1
  if (c === 'investment') return tx.method === 'invested_balance' ? 0 : -1
  if (tx.type === 'transfer_in') return 1
  if (tx.type === 'transfer_out') return -1
  return 0
}

// An admin credit to the spendable balance: shown as a Deposit with this detail.
export const isAccountCredit = (tx: TxLike) => tx.source === 'admin_funding'

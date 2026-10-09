// What a transaction MEANS to the client, decided by the business event that
// created it (transactions.source, set by the database — see the
// 202611130001_transaction_source migration), never by the sign of the amount
// or by "the balance went up".
//
//   admin_funding     → Deposit (an admin credited the spendable balance)
//   client_deposit    → Deposit
//   investment_profit → Profit (written by the investment-return workflow)
//   investment_principal → Investment
//   withdrawal / fee  → Withdrawal / Fee (an admin-applied fee is a real fee
//                       row, written by admin_apply_fee)
//   admin_debit       → Account debit (an admin took money off the spendable
//                       balance; not a fee, withdrawal or investment)
//   reversal          → Reversal (a previous transaction intentionally undone)
//   profit-balance adjustments, by the reason the admin chose (never by the
//   free-text note; none of these is an investment return):
//     loyalty_reward → Profit · Loyalty Reward
//     promotional_credit → Profit · Promotional Credit
//     profit_correction → Profit Balance Correction
//     reconciliation → Account Reconciliation
//     profit_adjustment → Profit (no category stated)
//   each shown with the reason the admin entered for that transaction
//   balance_adjustment → Adjustment (an admin changed the invested / pending
//                       balance; there is no more precise meaning)
//
// Rows without a source (none today; only possible for a future legacy import)
// fall back to their stored type. A bare 'adjustment' is never assumed to be
// profit or a debit — it is shown neutrally as an Adjustment. The sign of the
// amount never decides the meaning.

export type TxCategory = 'deposit' | 'account_debit' | 'profit' | 'profit_adjustment' | 'loyalty_reward' | 'promotional_credit'
  | 'profit_correction' | 'reconciliation' | 'investment' | 'withdrawal' | 'fee' | 'reversal' | 'adjustment' | 'transfer' | 'other'

// Admin changes to the separate profit balance, by stated reason.
export const PROFIT_BALANCE_CATEGORIES: TxCategory[] = ['loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation', 'profit_adjustment']

export type TxLike = { type: string; method?: string | null; direction?: string | null; source?: string | null }

export function txCategory(tx: TxLike): TxCategory {
  switch (tx.source) {
    case 'client_deposit': case 'admin_funding': return 'deposit'
    case 'investment_profit': return 'profit'
    case 'profit_adjustment': return 'profit_adjustment'
    case 'loyalty_reward': return 'loyalty_reward'
    case 'promotional_credit': return 'promotional_credit'
    case 'profit_correction': return 'profit_correction'
    case 'reconciliation': return 'reconciliation'
    case 'investment_principal': return 'investment'
    case 'withdrawal': return 'withdrawal'
    case 'fee': return 'fee'
    case 'admin_debit': return 'account_debit'
    case 'reversal': return 'reversal'
    case 'balance_adjustment': return 'adjustment'
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
  if (c === 'withdrawal' || c === 'fee' || c === 'account_debit') return -1
  if (c === 'investment') return tx.method === 'invested_balance' ? 0 : -1
  if (tx.type === 'transfer_in') return 1
  if (tx.type === 'transfer_out') return -1
  return 0
}

// An admin credit to the spendable balance: shown as a Deposit with this detail.
export const isAccountCredit = (tx: TxLike) => tx.source === 'admin_funding'

// Admin wording, more precise than the client's: what the administrator did.
export function adminTxLabel(tx: TxLike): string {
  if (isAccountCredit(tx)) return 'Account Credit'
  switch (txCategory(tx)) {
    case 'account_debit': return 'Account Debit'
    case 'deposit': return 'Deposit'
    case 'profit': return 'Profit'
    // Profit-balance entries: "Profit" plus why it was granted; the admin's own
    // reason is shown beneath. "Manual" marks them apart from investment returns.
    case 'profit_adjustment': return tx.direction === 'debit' ? 'Profit · Manual debit' : 'Profit · Manual credit'
    case 'loyalty_reward': return 'Profit · Loyalty Reward'
    case 'promotional_credit': return 'Profit · Promotional Credit'
    case 'profit_correction': return 'Profit Balance Correction'
    case 'reconciliation': return 'Account Reconciliation'
    case 'investment': return 'Investment'
    case 'withdrawal': return 'Withdrawal'
    case 'fee': return tx.method === 'service_fee' ? 'Tarafab Service Fee' : 'Fee'
    case 'reversal': return 'Reversal'
    case 'transfer': return 'Transfer'
    case 'adjustment': return 'Adjustment'
    default: return tx.type.replace(/_/g, ' ')
  }
}

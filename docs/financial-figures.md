# Client financial figures: definitions

Internal reference for the client dashboard figures. Not shown to clients.

## Balances (stored fields, `accounts`)

| Dashboard label | Source |
|---|---|
| Account balance | `available_balance` (spendable) |
| Profit balance | `profit_balance`. A requested withdrawal from profit stays in this balance until it is approved, then it is deducted once. |
| Pending | `pending_balance` (held for investments awaiting activation) **plus** open deposits and withdrawals (added by `/api/client/account`) |
| Total invested | `client_investment_summary.total_invested`: all principal ever invested, including completed investments |
| Active investments | `client_investment_summary.active_principal` |

`accounts.account_balance` is a legacy total column. It is not shown to clients. `admin_adjust_balance(p_field => 'account_balance')` changes only that column.

## Recorded activity totals (`txTotals` in `components/dashboard/ExtraTabs.tsx`)

- **Deposits credited:** completed deposits and admin credits to the spendable balance.
- **Withdrawals paid:** completed withdrawals.
- **Investment returns credited:** net `investment_profit` transactions (returns linked to an investment).

Adjustments recorded only on the legacy `account_balance` column are excluded from these totals, because they never changed a balance the client sees. They are still listed in the client's history.

A gap between "Investment returns credited" and "Profit balance" is expected when:
- profit was withdrawn; or
- the team recorded other profit credits or debits (profit adjustments, loyalty rewards, promotional credits).

## Investment returns

1. `client_submit_investment` holds the amount and stores the product version, return type and rate.
2. `admin_review_investment` approves it. This charges the entry fee, moves the net principal to invested and sets the maturity date.
3. `admin_complete_investment` only works after maturity. It:
   - returns the principal to the available balance;
   - credits the configured return once, under idempotency key `inv-completion-profit-<id>`. The return is `principal × return_rate_pct / 100` for `fixed_rate`, or `return_amount` for `fixed_amount`.
4. The credit is a `return` transaction tagged `investment_profit`, linked through `investment_transactions(kind = 'return')`.
5. Each credit records an `investment_profit_adjustments` row and an audit-log entry.

"Edit profit / return" (`admin_set_investment_profit`) is a separate, audited manual correction on an investment. It is also recorded as an investment-linked return.

## Open item

Admins can still adjust the legacy `account_balance` column, and clients see those rows in their history as "Account credit" or "Account debit" even though no visible balance changed. Hiding that field from the admin adjustment form, or retiring the column, is a product decision that hasn't been made yet.

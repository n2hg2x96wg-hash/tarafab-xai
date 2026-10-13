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

## Manual profit credits

Admin → Profit credits, or the "Profit Credit" tab on a client. Database function `admin_manual_profit_credit` (migration `202611190001_manual_profit_credit.sql`); API `POST /api/admin/profit-credit`.

The admin chooses one classification:

| Classification | Ledger entry | Client label |
|---|---|---|
| Verified investment return | Goes through `admin_set_investment_profit` on the chosen investment: a `return` transaction tagged `investment_profit`, linked to that investment. Only the investment's recorded return changes; principal, rate, dates and status are not touched. | Profit · Investment return |
| Documented profit distribution | One `adjustment` on `profit_balance`, source `profit_distribution`, reference `PRF-…` | Profit distribution |
| Other authorized profit allocation | Same, source `profit_allocation` | Profit credit received |

Loyalty rewards, promotional credits and corrections are not manual profit credits. They stay under Balance actions → Adjust profit balance.

**Dates.**
- `transactions.effective_at` is the effective date the client sees. Today's date posts at the posting time. An earlier date posts at noon on that date in the admin's time zone, and requires a written justification.
- `transactions.created_at` is the actual posting time. It is never replaced.
- Future dates, and dates before the account was opened, are refused.

**Posting and records.** Each credit is one database transaction:
1. Lock the account.
2. Post the ledger entry.
3. Update `profit_balance`.
4. Write the admin record in `manual_profit_credits` (admin-only RLS). It holds the amount, classification, reason, justification, effective date, posting time, and profit balance before and after.
5. Write an audit-log entry (`MANUAL_PROFIT_CREDIT`).
6. Write one client notification, linked by `client_notifications.transaction_id`, which is unique.

**Idempotency.** A repeated request key returns the existing credit (`duplicate: true`) and posts nothing.

**Corrections.** Posted credits are not edited or deleted. Corrections go through the existing processes, such as a profit balance correction.

## Open item

Admins can still adjust the legacy `account_balance` column, and clients see those rows in their history as "Account credit" or "Account debit" even though no visible balance changed. Hiding that field from the admin adjustment form, or retiring the column, is a product decision that hasn't been made yet.

## Historical investments

Admin → Historical investments, or the "Historical Investment" tab on a client. Migration `202611200001_historical_investments.sql`; API `POST /api/admin/historical-investments` (`check`, `record`, `correct`) and `/api/admin/historical-evidence` (private file upload and short-lived view links).

This documents a genuine past investment that is missing from a client's history. **It never moves money:** no deposit, debit, credit or fee is created, and no balance changes.

**What is stored.**
- A `client_investments` row with `is_historical = true`. `start_date` is the effective investment date (noon in the admin's time zone); `created_at` is the real time it was recorded and is never backdated. Principal is the verified amount, the product and terms version are the existing ones (never edited), and the status is the one the admin's records show (active, completed, matured or cancelled; an old date never implies completion).
- An admin-only `historical_investment_records` row: amount, currency, effective date, record time, status and how it was established, end date, original reference (and the matching ledger entry if one exists), evidence reference and file path, reason, linked returns, duplicate confirmation, review flags, admin.
- An audit entry (`HISTORICAL_INVESTMENT_RECORDED`). Later corrections go to `historical_investment_corrections` (append-only) and the audit log (`HISTORICAL_INVESTMENT_CORRECTED`).

**Duplicates.**
- Blocked: the original reference already belongs to an investment, to another historical record of this client, or to a ledger entry already linked to an investment.
- Needs explicit confirmation (recorded): an investment of this client with the same amount within 3 days, or the same product within 31 days.
- A repeated request key returns the record already made; one historical submission per client is processed at a time.

**Returns.** Only profit credits already in the ledger (completed, this client, dated on or after the investment, not linked to any investment) can be linked. Linking adds no credit; the investment's recorded return equals the linked credits. The product's configured return is shown for information and never credited. A genuine return that was never paid goes through Manual profit credit → Verified investment return.

**Review flags** (the record is saved and marked for review): terms published after the investment date, amount outside the version's limits, date before the account opened here, no reference, no evidence, no end date for an ended investment, past maturity but recorded active, ended before the term, configured return with no linked credit, and active principal not held in the invested balance.

**Ledger and balances.** An active historical investment is not backed by the invested balance, so the existing Reconciliation report shows it under "active investments not invested". That difference is resolved through reconciliation, never automatically. A historical investment cannot be completed through the normal completion action (which would return principal that was never held); its status changes through a historical-record correction, and status notifications about money movements are not sent for it.

**Corrections.** Change status (normal transition rules), link an existing return, mark review complete, or void. Voiding keeps every row; the investment disappears from the client's history and totals, and the returns it linked are released so they can be linked to the corrected record.

**Client view.** Investment Center shows the entry labelled "Historical investment recorded" with the investment date and the date it was added to the records, only credited returns (no projection), and a timeline of invested, ended and recorded.

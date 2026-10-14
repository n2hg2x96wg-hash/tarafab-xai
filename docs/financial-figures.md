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

## Manual profit credits and debits

Admin → Profit credit & debit, or the "Profit Credit / Debit" tab on a client. One panel switches between credit and debit over the client's profit balance, requested withdrawals and the amount available to debit (`GET /api/admin/profit-balance` → `admin_profit_balance_snapshot`).

- Credits: `admin_manual_profit_credit_v2` (migration `202611220001_profit_credit_debit.sql`); API `POST /api/admin/profit-credit`. The original `admin_manual_profit_credit` (migration `202611190001`) keeps its signature and calls v2, so it follows the same rules.
- Debits: `admin_manual_profit_debit`; API `POST /api/admin/profit-debit`.

**Credit classifications**

| Classification | Ledger entry | Client label |
|---|---|---|
| Verified investment return | Goes through `admin_set_investment_profit` on the chosen investment: a `return` transaction tagged `investment_profit`, linked to that investment. Only the investment's recorded return changes; principal, rate, dates and status are not touched. | Profit · Investment return |
| Documented profit distribution | One `adjustment` on `profit_balance`, source `profit_distribution`, reference `PRF-…` | Profit distribution |
| Other authorized profit credit | Same, source `profit_allocation` | Profit Credit |
| Correction of an earlier manual debit | Same, source `profit_correction`, linked to the debit (`reverses_transaction_id`); at most what is left of that debit | Profit Balance Correction |

**Debit categories** (one `adjustment` on `profit_balance`, direction `debit`, reference `PDB-…`; only `profit_balance` changes)

| Category | Source | Client label | Needs reference or evidence |
|---|---|---|---|
| Reversal of an earlier profit credit | `profit_correction`, linked to the credit; at most what is left of it; never an investment return (change those with Edit profit / return) | Profit Balance Correction | No |
| Profit balance correction | `profit_correction` | Profit Balance Correction | No |
| Profit paid out to the client | `profit_payout` | Profit Payout | Yes |
| Authorized charge | `profit_debit` | Profit Debit | Yes |
| Other authorized debit | `profit_debit` | Profit Debit | Yes |

A debit is never labelled as a withdrawal the client requested. Client withdrawal requests stay under Withdrawals.

**Available balance.** A debit may not exceed `profit_balance` minus the client's profit withdrawals still awaiting review (they stay reserved inside `profit_balance` until approved). The check runs with the account row locked, so two simultaneous debits cannot both pass.

**Dates.**
- `transactions.effective_at` is the effective date the client sees. Today posts at the posting time; an earlier date posts at noon on that date in the admin's time zone.
- `transactions.created_at` and the record's `posted_at` are the actual posting time. They are never replaced.
- Future dates are refused.
- A historical (earlier) date needs a reason of at least 10 characters and a supporting reference or evidence file, and is flagged "Historical" for admins.
- A date before the client's account was opened is neither refused outright nor allowed silently. The admin confirms a pre-opening exception and gives an accounting basis (at least 20 characters); otherwise the entry should be recorded against the correct account. The opening date is never changed. The entry is flagged "Pre-opening exception" and the audit log keeps the opening date.

**Duplicates.** A repeated request key returns the existing entry (`duplicate: true`) and posts nothing. An external reference can be used once per client across credits and debits.

**Posting and records.** Each entry is one database transaction:
1. Lock the account.
2. Validate.
3. Post the ledger entry and update `profit_balance`.
4. Write the admin record in `manual_profit_credits` or `manual_profit_debits` (admin-only RLS). It holds the amount, category, client-visible description, internal note, external reference, evidence path, historical reason, pre-opening basis, effective date, posting time, and profit balance before and after.
5. Write an audit-log entry (`MANUAL_PROFIT_CREDIT` / `MANUAL_PROFIT_DEBIT`) with the admin as actor and status `posted`.
6. Write one client notification ("Profit Credit Notification" / "Profit Balance Update"), linked by the unique `client_notifications.transaction_id`.

Any failure rolls all of it back, so there is no partial update and no notification. Notifications and the client feed never include the administrator's name, email, ID or role.

**Evidence** files go to the private `historical-evidence` bucket. Only admins can upload or read them, through `/api/admin/historical-evidence`.

**Corrections.** Posted entries are never edited or deleted. A wrong credit is reversed with a linked debit, and a wrong debit is corrected with a linked credit. Both stay on record.

**Rollback plan.** The migration is additive: new columns with defaults, a new table, and new functions. To withdraw the feature without touching posted entries:
1. Revoke execute on `admin_manual_profit_debit`, `admin_manual_profit_credit_v2` and `admin_profit_balance_snapshot` from `authenticated`.
2. Restore the earlier body of `admin_manual_profit_credit` from `202611190001`.
3. Redeploy the previous app version.

Keep the records, columns and the extended `transactions_source_check` so the posted rows remain valid.

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

## Admin dashboard reconciliation (October 2026)

The admin dashboard figures were checked against the ledger using read-only, aggregate queries over client accounts only. No transaction was added, changed, reposted or deleted.

| Dashboard figure | Source | Result |
|---|---|---|
| Profit balances ($1,121,114.53) | `sum(accounts.profit_balance)` | **Reconciles exactly.** Profit-balance credits less debits ($1,923,913.53), minus completed profit withdrawals ($802,799.00). |
| Client account balances (available) | `sum(accounts.available_balance)` | **Reconciles exactly.** Admin credits to available ($873,047.99) − admin debits ($41,976.99) − fees ($130.94) − investment principal in ($50,700.00) + principal returned (`principal_out`, $50,259.00). |
| Invested principal | `sum(principal)` of active investments = `sum(accounts.invested_balance)` | **Reconciles** ($297.00): $50,700.00 in − $144.00 fees − $50,259.00 returned. |
| Withdrawals completed | completed `withdrawal` transactions | **Consistent.** 5 completed, all from the profit balance, $802,799.00 gross ($700.00 in fees). |
| Deposits completed ($0) | completed `deposit` transactions | **Misleading.** It is not a calculation error, but it was the confirmed discrepancy. Every completed money-in entry so far is an admin account credit (`adjustment`, source `admin_funding`): 39 credits, $1,199,687.99. The old card counted only client `deposit` transactions. |

**Change (migration `202611230001_admin_overview_credits.sql`).** `admin_overview()` now also returns `credits`: the count and total of completed admin account credits, split by target balance. The dashboard shows "Client deposits completed" and "Account credits (admin)" side by side, and the client page shows an "Account credits (admin)" figure. The change is read-only and additive, and every existing key keeps its definition.

**Still open (product decision).** $326,640.00 of the admin credits, and $152,639.75 of admin debits, were posted to the legacy `account_balance` column rather than the spendable balance (see "Open item" above). The dashboard reports that legacy share under the credits card.

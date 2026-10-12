# Bank-transfer withdrawals

Clients can withdraw to a saved bank account as well as to a Bitcoin address or a verified wallet.

**No bank payout provider is connected.** Nothing is paid automatically. Every bank withdrawal is paid by staff from the company's bank account and confirmed by hand in Admin → Transactions. This is the same manual review used for crypto withdrawals.

## Supported countries

| Country | Route | Currency | Fields collected |
|---|---|---|---|
| United States | ACH | USD | ABA routing number (checksum), account number (4–17 digits), checking or savings |
| United Kingdom | Faster Payments | GBP | sort code (6 digits), account number (8 digits) |
| Canada | EFT | CAD | institution (3), transit (5), account number (7–12) |
| Australia | BSB transfer | AUD | BSB (6), account number (5–9) |
| SEPA: AT BE BG HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES | SEPA | EUR | IBAN (country prefix, length, mod-97 checksum), optional BIC (must be for the same country) |

Every country also needs:
- the account holder's full legal name;
- the bank name;
- an optional nickname.

Any other country shows "not available yet". These are the routes **your team** has agreed to pay by hand.

**Turning routes on or off:**
- Edit `system_settings` key `bank_withdrawals`: `{"enabled": true, "mode": "manual", "routes": [...]}`.
- Setting `"enabled": false` hides the option and refuses new requests.

The form never asks for a PIN, online-banking password, card number, CVV or one-time code.

## Data and security

**Table `client_bank_accounts`** (one row per saved destination):
- `details_enc` holds the account identifiers, encrypted with `pgp_sym_encrypt`. The key is the Supabase Vault secret `bank_details_key`.
- Clients have column-level SELECT on masked columns only (last 4, bank name, country, status…), and RLS limits them to their own rows. `details_enc` and `fingerprint` cannot be selected by any client.
- There are no INSERT, UPDATE or DELETE grants. Changes go only through these functions, which act on `auth.uid()` and validate every field again:
  - `client_save_bank_account`
  - `client_rename_bank_account`
  - `client_remove_bank_account`
- Saving requires verified KYC.
- The holder name is compared with the KYC legal name and the result is stored as `name_check`. A mismatch is allowed but flagged for staff.
- The legal name and the nickname are never changed.
- Duplicates are refused using a per-client SHA-256 fingerprint. A client can save at most 10 accounts.
- Replacing details retires the old row (`removed`) and creates a new one that must be verified again.
- An account with a withdrawal in progress cannot be removed or replaced.

**Admin access:**
- Admins can read masked columns.
- Full details come only from `admin_bank_account_details(id, reason)`. It requires a reason and writes an `audit_logs` row each time.

**Audit:** these events are audited with country, route and last 4 only, never full numbers:
- add, replace, remove;
- verify and reject;
- detail views.

## Withdrawal workflow

1. **Client request.** The client picks a saved account, enters a USD amount and confirms. `client_request_withdrawal_to_bank` works exactly like the wallet version:
   - it locks the account row;
   - it checks the balance minus pending withdrawals;
   - it applies the idempotency key and the rate limit (5 per 10 minutes);
   - it inserts a `withdrawal` with status `pending_review`, a `WDR-…` reference and `bank_account_id`.

   The amount is held, not deducted. The fee is the existing `withdrawal` rule (network `Bank transfer`).
2. **Account check.** An admin opens the request in Admin → Transactions. They check the holder name against KYC and verify the bank account, with a required note.
3. **Payment.** The admin views the full details (reason recorded) and sends the transfer from the company bank. The exchange rate is applied by the sending bank.
4. **Approve.** The admin clicks **Transfer sent · Approve** and enters the bank's payment reference. `admin_review_transaction` refuses this unless:
   - the account is verified; and
   - a reference is given.

   It then:
   - deducts the balance once;
   - sets the status to `completed`;
   - stores the reference in `tx_hash`;
   - writes the audit row.

   If it was not paid, the admin chooses **Reject** with a reason. Nothing is deducted.

A request is never marked completed by saving an account, submitting a request or verifying an account.

## Before switching to automatic payouts

A provider (for example Wise Platform, Stripe Connect payouts or a banking partner) needs:
- a contract and KYB with that provider;
- API credentials held server-side only (Supabase secrets or Vercel server env, never `NEXT_PUBLIC_*`);
- a server-side payout call;
- webhook handling that marks `completed` only on the provider's confirmed status;
- retry, failure and reconciliation handling;
- the provider's own field requirements per country and currency, replacing the table above.

Until then, `mode` stays `manual`.

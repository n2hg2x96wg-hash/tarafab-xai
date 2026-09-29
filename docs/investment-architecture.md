# Investment products: proposed architecture

Status: **PROPOSAL, NOT IMPLEMENTED.** Nothing in this document has been applied
to the database. No table, function, policy or balance has been changed.

Inspected live on 2026-09-29 (read-only queries only).

---

## 0. What exists today (facts, not assumptions)

| Item | Current state |
|---|---|
| `accounts` | one row per user (`user_id` unique). Fields: `account_balance`, `available_balance`, `invested_balance`, `pending_balance`, `profit_balance`, `trading_status` (`active`/`inactive`), `trading_strategy_name`. All balances have `CHECK (>= 0)`. |
| `invested_balance` | **0.00 on all 3 accounts.** Only ever changed by `admin_adjust_balance`. |
| `transactions` | the ledger. `type` already allows `investment` and `return`, `direction` is `credit`/`debit`, `idempotency_key` is unique per user, `amount > 0`. Used types so far: `deposit`, `withdrawal`, `adjustment`. |
| `transaction_events` | status history for transactions (0 rows today). |
| `audit_logs` | actor, target user, action, entity, entity_id, details (jsonb), result. |
| `system_settings` | has a `fees` key (no investment fees defined). |
| Products / plans / client investments | **none exist.** |

### Pre-existing discrepancies (reported, NOT to be changed by this work)

1. Account `2d918aec…`: `account_balance` 43.99, sum of sub-balances 44.00 (1 cent apart).
2. Balances are not derivable from the ledger: completed credits − debits = 87.99
   vs `account_balance` 43.99 (`2d918aec…`), and 52.00 vs 26.00 (`f68bb16c…`).
   Likely cause: admin balance adjustments that set fields independently of
   ledger rows. **Decision needed (G1).**

Design consequence: the investment system must never recompute, reconcile or
"repair" any balance. Every money movement changes named fields by an explicit
amount, checks the source field is sufficient, and records itself.

---

## A. Proposed schema (additive only)

All new tables. No existing table is altered except the one additive column
noted in §E (optional, needs approval G5).

### A1. `investment_products`: the product's identity (rarely changes)

```sql
create table public.investment_products (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,               -- stable slug, e.g. 'btc-fixed-90'
  status        text not null default 'draft'
                check (status in ('draft','open','closed','retired')),
  current_version_id uuid,                          -- FK added after versions exists
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

### A2. `investment_product_versions`: the terms, immutable once published

Every change to terms creates a **new version**. A client investment points at
the exact version they accepted, so terms can never change underneath them.

```sql
create table public.investment_product_versions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.investment_products(id) on delete restrict,
  version         int  not null,
  name            text not null,
  description     text not null,
  currency        text not null default 'USD' check (currency = 'USD'),   -- only USD exists today
  min_amount      numeric(20,2) not null check (min_amount > 0),
  max_amount      numeric(20,2) check (max_amount is null or max_amount >= min_amount),
  term_days       int check (term_days is null or term_days > 0),       -- null = open-ended
  risk_level      text not null check (risk_level in ('low','medium','high')),
  risk_disclosure text not null,                                        -- required, shown before investing
  terms_text      text not null,                                        -- full terms the client accepts
  entry_fee_pct   numeric(6,4) not null default 0 check (entry_fee_pct >= 0 and entry_fee_pct < 1),
  -- Return definition. NULL means "no defined return": the UI shows
  -- "Not specified" and nothing is ever calculated.
  return_type     text check (return_type in ('none','fixed_rate')),
  return_rate_pct numeric(8,4) check (return_rate_pct is null or return_rate_pct >= 0),
  eligibility     jsonb not null default '{"kyc_required": true}'::jsonb,
  published_at    timestamptz,                                          -- null = draft version
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (product_id, version),
  check (return_type is distinct from 'fixed_rate' or (return_rate_pct is not null and term_days is not null))
);
-- Published versions cannot be edited or deleted (enforced by trigger).
```

### A3. `client_investments`: one row per position a client holds

```sql
create table public.client_investments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete restrict,
  account_id         uuid not null references public.accounts(id) on delete restrict,
  product_id         uuid not null references public.investment_products(id) on delete restrict,
  product_version_id uuid not null references public.investment_product_versions(id) on delete restrict,
  principal          numeric(20,2) not null check (principal > 0),
  fee_amount         numeric(20,2) not null default 0 check (fee_amount >= 0),
  currency           text not null default 'USD',
  status             text not null check (status in
                       ('pending_activation','active','matured','closed','cancelled','rejected')),
  start_date         timestamptz,              -- set on activation, never guessed
  maturity_date      timestamptz,              -- start_date + term_days, null if open-ended
  terms_accepted_at  timestamptz not null,
  idempotency_key    text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
```

No `current_value`, `profit` or `performance` column. Those are only ever
derived from real ledger rows (`return` transactions linked to the investment).

### A4. `investment_transactions`: link table into the existing ledger

The existing `transactions` table stays the single ledger. This table records
which ledger rows belong to which investment and why.

```sql
create table public.investment_transactions (
  id                   uuid primary key default gen_random_uuid(),
  client_investment_id uuid not null references public.client_investments(id) on delete restrict,
  transaction_id       uuid not null unique references public.transactions(id) on delete restrict,
  kind                 text not null check (kind in ('principal_in','fee','return','principal_out','cancellation_refund')),
  created_at           timestamptz not null default now()
);
```

### A5. `client_investment_events`: status history (append-only)

```sql
create table public.client_investment_events (
  id                   bigint generated always as identity primary key,
  client_investment_id uuid not null references public.client_investments(id) on delete restrict,
  from_status          text,
  to_status            text not null,
  actor_id             uuid references auth.users(id),
  reason               text,
  created_at           timestamptz not null default now()
);
-- No UPDATE/DELETE permitted for anyone (trigger raises).
```

---

## B. Relationships

```
auth.users ─1───1─ profiles
     │
     └─1───1─ accounts ─────────────┐
     │                              │
     └─1───*─ client_investments ───┤ account_id
                 │      │  │        │
                 │      │  └──*─1── investment_product_versions ─*─1─ investment_products
                 │      │
                 │      └─1───*─ client_investment_events   (status history)
                 │
                 └─1───*─ investment_transactions ─1───1─ transactions (existing ledger)
```

All foreign keys are `ON DELETE RESTRICT`: nothing financial can be deleted by
cascading from somewhere else.

---

## C. Migration plan (each step separately approved)

| Step | What | Touches existing data? | Reversible |
|---|---|---|---|
| 1 | Create the 5 tables, indexes, triggers, RLS. **No functions that move money.** | No | Yes: drop the new, empty tables |
| 2 | Admin RPCs to create/publish product versions. Admin UI. | No | Yes |
| 3 | Client read-only UI: Investment Center lists **published, open** products. No invest button. | No | Yes |
| 4 | `client_request_investment` RPC (money moves). **Separately authorised, see G3.** | Yes: `accounts` + new ledger rows, only on a client action | Via a reversing entry, never a delete |
| 5 | Admin activation / maturity / cancellation RPCs | Yes, only on admin action | Via reversing entries |

Every step:
- written as a forward-only migration file in `supabase/migrations/`
- tested first inside a `begin … rollback` transaction against the live
  schema, then a before/after snapshot of row counts and balance sums is taken
- verified that `accounts` sums are identical before and after (steps 1-3)

---

## D. RLS and security

| Table | Client | Admin | Writes |
|---|---|---|---|
| `investment_products` | SELECT where `status = 'open'` | SELECT all | admin RPCs only |
| `investment_product_versions` | SELECT where `published_at is not null` and product open | SELECT all | admin RPCs only; published rows immutable (trigger) |
| `client_investments` | SELECT own (`user_id = auth.uid()`) | SELECT all | **no direct INSERT/UPDATE/DELETE policy for anyone**; only `security definer` RPCs |
| `investment_transactions` | SELECT where the investment is theirs | SELECT all | RPCs only |
| `client_investment_events` | SELECT own | SELECT all | RPCs only; append-only |

Rules carried over from the existing system:
- every RPC is `security definer`, `set search_path = public`, and `revoke all … from public, anon`
- admin RPCs start with `if not public.is_admin() then raise exception 'Admins only'`
- client RPCs use `auth.uid()` only. A client-supplied user or account id is never trusted.
- no service-role key in the browser; the Next.js routes call RPCs as the signed-in user (same pattern as deposits and KYC)
- every state change writes `audit_logs` in the same transaction

---

## E. Preserving existing data

- **No existing row is updated by the migration.** Steps 1-3 only create
  empty tables.
- **`invested_balance` stays as it is and keeps its meaning.** It is currently
  0.00 for every account. Once step 4 exists, it is changed only by the
  investment RPCs, by exactly the principal of active investments. Admin
  `admin_adjust_balance` keeps working unchanged.
- Consistency check (read-only, runs in the admin panel):
  `invested_balance` vs `sum(principal) where status in ('pending_activation','active')`.
  A mismatch is **shown to the admin, never auto-corrected.**
- The two pre-existing discrepancies in §0 are left exactly as they are unless
  you decide otherwise (G1).
- Optional additive column `transactions.client_investment_id uuid null`
  (nullable, no default, existing rows untouched) as a convenience for queries.
  Not required, because `investment_transactions` already links them (G5).

---

## F. How the eventual Invest action would work (step 4, not built)

`client_request_investment(p_product_version_id, p_amount, p_accepted_terms_hash, p_idempotency_key)`

Runs as **one database transaction**; any failure rolls back everything:

1. `v_uid := auth.uid()`; null → reject.
2. Idempotency: if a `client_investments` row exists for `(v_uid, key)`, return it. No second debit.
3. KYC gate: `profiles.verification_status = 'verified'` **and** a real
   `kyc_submissions` row with status `verified` (the legacy-profile case from
   earlier must not pass). Configurable via `eligibility`, default required.
4. Load version `FOR SHARE`; must be published and its product `open`.
5. `p_accepted_terms_hash` must equal the hash of that version's `terms_text`
   (proves the client saw these exact terms).
6. Amount checks: `min_amount <= amount <= coalesce(max_amount, amount)`, 2 decimals.
7. Lock the account row `FOR UPDATE`; require `available_balance >= amount`.
   **account_balance is not checked or recalculated**, only the field being moved.
8. Fee = `round(amount * entry_fee_pct, 2)`; principal = amount − fee.
9. Update **only**: `available_balance -= amount`, `invested_balance += principal`,
   `account_balance -= fee` (and nothing else). All `CHECK (>= 0)` constraints stay in force.
10. Insert `client_investments` with status `pending_activation` (see G4).
11. Insert ledger rows in `transactions`: `investment` (debit, principal) and, if
    fee > 0, `fee` (debit). Link both via `investment_transactions`.
12. Insert `client_investment_events` (null → pending_activation) and `audit_logs`.
13. Return the investment row.

The UI would show a review screen with product, version, amount, fee, principal,
term, maturity date, risk disclosure and a terms checkbox, then a final Confirm,
the same pattern as the new withdrawal review.

**Returns** are never computed automatically unless `return_type = 'fixed_rate'`
**and** you approve automatic crediting (G6). Otherwise an admin records a
return, which creates a real `return` ledger row linked to the investment.
Performance shown to clients = sum of those real rows. Nothing else.

---

## G. Needs your explicit approval before implementation

| # | Decision | My recommendation |
|---|---|---|
| G1 | What to do about the 1-cent mismatch and the ledger-vs-balance gap in §0 | Leave untouched; show them in an admin reconciliation view only |
| G2 | Approve step 1 (empty tables + RLS, no money logic) | Safe to approve |
| G3 | Approve step 4 (the money-moving RPC) **separately**, after steps 1-3 are live and reviewed | Do not approve yet |
| G4 | Does money go straight to `active`, or wait at `pending_activation` for an admin to activate? | Admin activation first; it matches how deposits and withdrawals already work |
| G5 | Add the optional nullable `transactions.client_investment_id` column? | Not needed; skip |
| G6 | Are returns ever credited automatically, or only by an admin? | Admin-only. Automatic crediting is a legal/financial commitment you should define in writing first. |
| G7 | Early withdrawal / cancellation: allowed? penalty? | Needs your business rules; not designed until defined |
| G8 | Who writes the product terms and risk disclosures? | You or your legal adviser; the system only stores and shows them |
| G9 | KYC required to invest? | Yes, required (default in `eligibility`) |

-- Transaction source: what business event created each transaction.
--
-- Problem: every admin balance change is stored as type 'adjustment' (created
-- only by admin_adjust_balance), and the client UI showed every 'adjustment' as
-- "Profit" — so an admin funding a client's account read as investment profit.
--
-- Fix (additive, non-destructive):
--   * a nullable `source` column (type is kept: admin_adjust_balance_effective
--     and other code rely on type = 'adjustment');
--   * one deterministic rule, _tx_source(), derived from fields recorded when
--     the row was created (type, method = balance field the admin changed,
--     direction, idempotency key / investment link);
--   * a BEFORE INSERT trigger so every new row is classified by the database;
--   * a one-time fill of `source` on existing rows ONLY where the stored
--     fields prove the event. No amount, date, reference, status, balance or
--     row is changed or deleted. Rows that cannot be proven keep source NULL
--     and keep their previous display.

alter table public.transactions add column if not exists source text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_source_check') then
    alter table public.transactions add constraint transactions_source_check check (source is null or source in (
      'client_deposit',       -- a client's own deposit (crypto, bank, wire, card…)
      'admin_funding',        -- an admin credited the client's spendable account balance
      'admin_debit',          -- an admin debited / corrected the spendable account balance
      'profit_adjustment',    -- an admin changed the profit balance directly (not an investment return)
      'balance_adjustment',   -- an admin changed another balance field (invested / pending)
      'investment_principal', -- principal moved into an investment
      'investment_profit',    -- a return recorded on an investment (investment-return workflow)
      'withdrawal',
      'fee',
      'transfer'
    ));
  end if;
end $$;

-- The rule. Only facts stored on the row are used; never the sign of the
-- amount alone. Returns NULL when the origin cannot be proven.
create or replace function public._tx_source(p_type text, p_method text, p_direction text, p_key text, p_linked_return boolean default false)
returns text language sql immutable as $$
  select case
    when p_type = 'deposit' then 'client_deposit'
    when p_type = 'withdrawal' then 'withdrawal'
    when p_type = 'fee' then 'fee'
    when p_type = 'investment' then 'investment_principal'
    when p_type in ('transfer_in', 'transfer_out') then 'transfer'
    -- Investment returns: written by admin_set_investment_profit (key 'inv-profit:…')
    -- and linked to the investment; an unlinked legacy 'return' stays unproven.
    when p_type = 'return' and (p_linked_return or coalesce(p_key, '') like 'inv-profit:%') then 'investment_profit'
    -- 'adjustment' rows are written only by admin_adjust_balance, with method =
    -- the balance field the admin changed and direction = credit / debit.
    when p_type = 'adjustment' and p_method in ('available_balance', 'account_balance') and p_direction = 'credit' then 'admin_funding'
    when p_type = 'adjustment' and p_method in ('available_balance', 'account_balance') and p_direction = 'debit' then 'admin_debit'
    when p_type = 'adjustment' and p_method = 'profit_balance' and p_direction in ('credit', 'debit') then 'profit_adjustment'
    when p_type = 'adjustment' and p_method in ('invested_balance', 'pending_balance') and p_direction in ('credit', 'debit') then 'balance_adjustment'
    else null
  end
$$;

create or replace function public._tx_set_source()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source is null then
    new.source := public._tx_source(new.type, new.method, new.direction, new.idempotency_key);
  end if;
  return new;
end $$;

drop trigger if exists transactions_set_source on public.transactions;
create trigger transactions_set_source before insert on public.transactions
  for each row execute function public._tx_set_source();

-- Existing rows: metadata only, and only where provable. `source` is not in the
-- status-update trigger's column list, so no withdrawal-fee trigger fires.
update public.transactions t
   set source = public._tx_source(t.type, t.method, t.direction, t.idempotency_key,
                  exists (select 1 from public.investment_transactions it where it.transaction_id = t.id and it.kind = 'return'))
 where t.source is null;

-- Clients read transactions through column-level SELECT grants: allow the new
-- column to be read (read-only; clients still cannot insert or update).
grant select (source) on public.transactions to authenticated;

comment on column public.transactions.source is
  'Business event that created the transaction (see _tx_source). NULL = origin not provable from stored data.';

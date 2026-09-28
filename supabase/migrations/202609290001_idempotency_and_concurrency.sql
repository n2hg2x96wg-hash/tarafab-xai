-- Production hardening: additive only. No rows are modified or removed.
--
-- 1. transactions.idempotency_key (nullable) + per-user unique index, so a
--    repeated submit (double tap, retry after a dropped connection) returns
--    the original record instead of creating a second one.
-- 2. Optional "expected" arguments on admin writes, so an admin working from
--    a stale screen gets "refresh to view latest" instead of overwriting
--    changes made in the meantime.
-- 3. Server-side submission limits and receipt ownership checks.
--
-- Functions gain trailing DEFAULT NULL arguments. Postgres cannot add
-- arguments with CREATE OR REPLACE, so each old signature is dropped and
-- recreated in this same transaction; existing callers keep working.

alter table public.transactions add column if not exists idempotency_key text;

create unique index if not exists transactions_user_idempotency_key
  on public.transactions (user_id, idempotency_key) where idempotency_key is not null;

-- Client dashboard and admin client page: "this user's latest transactions".
create index if not exists idx_transactions_user_created
  on public.transactions (user_id, created_at desc);

-- Admin review queue and withdrawal reservation checks.
create index if not exists idx_transactions_open
  on public.transactions (user_id, type, method)
  where status in ('pending_review', 'pending', 'requested', 'under_review');

create or replace function public._check_idempotency_key(p_key text)
returns text language plpgsql immutable as $$
begin
  if p_key is null then return null; end if;
  if p_key !~ '^[A-Za-z0-9_-]{8,100}$' then raise exception 'Invalid request key'; end if;
  return p_key;
end $$;

/* ---------- client_submit_deposit ---------- */

drop function if exists public.client_submit_deposit(numeric, text, text, text);

create function public.client_submit_deposit(
  p_amount numeric, p_method text, p_receipt_path text default null, p_notes text default null,
  p_idempotency_key text default null
) returns public.transactions
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_tx public.transactions; v_key text := public._check_idempotency_key(p_idempotency_key);
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_method), '') = '' then raise exception 'Payment method is required'; end if;
  -- A receipt must be one this client uploaded into their own folder.
  if p_receipt_path is not null and p_receipt_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_.-]+$') then
    raise exception 'Invalid receipt';
  end if;
  if (select count(*) from public.transactions where user_id = v_uid and type = 'deposit'
        and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many deposit submissions. Please wait a few minutes and try again.';
  end if;

  begin
    insert into public.transactions (user_id, type, method, amount, status, reference, notes, idempotency_key)
    values (v_uid, 'deposit', trim(p_method), round(p_amount, 2), 'pending_review',
            'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
            nullif(concat_ws(' | ', nullif(trim(p_notes), ''), case when p_receipt_path is not null then 'receipt:' || p_receipt_path end), ''),
            v_key)
    returning * into v_tx;
  exception when unique_violation then
    -- The same request arrived twice at the same moment; return the first.
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
  end;
  return v_tx;
end $$;

/* ---------- client_request_withdrawal ---------- */

drop function if exists public.client_request_withdrawal(numeric, text, text, text);

create function public.client_request_withdrawal(
  p_amount numeric, p_source text, p_address text, p_notes text default null,
  p_idempotency_key text default null
) returns public.transactions
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acc public.accounts; v_pending numeric; v_balance numeric; v_tx public.transactions;
        v_key text := public._check_idempotency_key(p_idempotency_key);
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_source not in ('available_balance', 'profit_balance') then raise exception 'Choose which balance to withdraw from'; end if;
  if coalesce(trim(p_address), '') !~ '^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$' then raise exception 'Enter a valid Bitcoin address'; end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then raise exception 'Your account is suspended. Contact support.'; end if;

  -- The row lock serialises concurrent requests from the same client, so two
  -- simultaneous withdrawals cannot both pass the balance check.
  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;

  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;

  if (select count(*) from public.transactions where user_id = v_uid and type = 'withdrawal'
        and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many withdrawal requests. Please wait a few minutes and try again.';
  end if;

  v_balance := case when p_source = 'profit_balance' then v_acc.profit_balance else v_acc.available_balance end;
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = v_uid and type = 'withdrawal' and method = p_source and status in ('pending_review', 'pending', 'requested', 'under_review');
  if round(p_amount, 2) > v_balance - v_pending then
    raise exception 'Amount is more than you can withdraw. Available: %', to_char(greatest(v_balance - v_pending, 0), 'FM999,999,999,990.00');
  end if;

  insert into public.transactions (user_id, type, method, amount, status, reference, address, network, notes, idempotency_key)
  values (v_uid, 'withdrawal', p_source, round(p_amount, 2), 'pending_review',
          'WDR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          trim(p_address), 'bitcoin', nullif(trim(p_notes), ''), v_key)
  returning * into v_tx;
  return v_tx;
end $$;

/* ---------- admin_adjust_balance ---------- */

drop function if exists public.admin_adjust_balance(uuid, text, text, numeric, text);

create function public.admin_adjust_balance(
  p_user_id uuid, p_field text, p_operation text, p_amount numeric, p_reason text,
  p_idempotency_key text default null, p_expected_updated_at timestamptz default null
) returns numeric
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_old numeric; v_new numeric; v_updated timestamptz;
        v_key text := public._check_idempotency_key(p_idempotency_key);
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_field not in ('account_balance', 'available_balance', 'invested_balance', 'pending_balance', 'profit_balance') then raise exception 'Unknown balance field'; end if;
  if p_operation not in ('credit', 'debit', 'set') then raise exception 'Unknown operation'; end if;
  if p_amount is null or p_amount < 0 or (p_amount = 0 and p_operation <> 'set') then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  execute format('select %I, updated_at from public.accounts where user_id = $1 for update', p_field)
    into v_old, v_updated using p_user_id;
  if v_old is null then raise exception 'Account not found'; end if;

  -- Replayed request: the adjustment already happened, report the current value.
  if v_key is not null and exists (select 1 from public.transactions where user_id = p_user_id and idempotency_key = v_key) then
    return v_old;
  end if;
  if p_expected_updated_at is not null and v_updated is distinct from p_expected_updated_at then
    raise exception 'This account changed since you opened it. Refresh to view the latest balances.' using errcode = '40001';
  end if;

  v_new := round(case p_operation when 'credit' then v_old + p_amount when 'debit' then v_old - p_amount else p_amount end, 2);
  if v_new < 0 then raise exception 'Resulting balance cannot be negative'; end if;
  execute format('update public.accounts set %I = $1, updated_at = now() where user_id = $2', p_field) using v_new, p_user_id;

  if v_new <> v_old then
    insert into public.transactions (user_id, type, method, amount, status, reference, notes, direction, idempotency_key)
    values (p_user_id, 'adjustment', p_field, abs(v_new - v_old), 'completed',
            'ADJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), trim(p_reason),
            case when v_new > v_old then 'credit' else 'debit' end, v_key);
  end if;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_balance_adjustment', 'account', p_user_id::text,
          jsonb_build_object('admin_id', v_admin, 'target_user_id', p_user_id, 'field', p_field, 'operation', p_operation,
                             'amount', p_amount, 'previous_value', v_old, 'new_value', v_new, 'reason', trim(p_reason)));
  return v_new;
end $$;

/* ---------- admin_update_client ---------- */

drop function if exists public.admin_update_client(uuid, text, text, text);

create function public.admin_update_client(
  p_user_id uuid, p_full_name text, p_account_status text, p_verification_status text,
  p_expected_updated_at timestamptz default null
) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_old public.profiles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Client not found'; end if;
  if p_expected_updated_at is not null and v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'This client was updated since you opened it. Refresh to view the latest details.' using errcode = '40001';
  end if;
  if p_account_status not in ('active', 'suspended') then raise exception 'Invalid account status'; end if;
  if p_verification_status not in ('unverified', 'pending', 'verified', 'rejected') then raise exception 'Invalid verification status'; end if;
  update public.profiles set full_name = coalesce(trim(p_full_name), ''), account_status = p_account_status,
    verification_status = p_verification_status, updated_at = now() where id = p_user_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_client_updated', 'profile', p_user_id::text,
          jsonb_build_object('before', jsonb_build_object('full_name', v_old.full_name, 'account_status', v_old.account_status, 'verification_status', v_old.verification_status),
                             'after', jsonb_build_object('full_name', trim(p_full_name), 'account_status', p_account_status, 'verification_status', p_verification_status)));
end $$;

/* ---------- admin_set_trading_status ---------- */

drop function if exists public.admin_set_trading_status(uuid, text, text);

create function public.admin_set_trading_status(
  p_user_id uuid, p_trading_status text, p_trading_strategy_name text default null,
  p_expected_updated_at timestamptz default null
) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_old public.accounts;
begin
  if not public.is_admin() then raise exception 'Only admins can change trading status'; end if;
  if p_trading_status not in ('active', 'inactive') then raise exception 'trading_status must be active or inactive'; end if;
  select * into v_old from public.accounts where user_id = p_user_id for update;
  if not found then raise exception 'No account found for this client'; end if;
  if p_expected_updated_at is not null and v_old.trading_status_updated_at is distinct from p_expected_updated_at then
    raise exception 'This status was changed since you opened it. Refresh to view the latest.' using errcode = '40001';
  end if;

  update public.accounts
  set trading_status = p_trading_status,
      trading_strategy_name = case when p_trading_status = 'active' then nullif(trim(p_trading_strategy_name), '') else null end,
      trading_status_updated_at = now()
  where user_id = p_user_id;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_trading_status_changed', 'account', p_user_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('trading_status', v_old.trading_status, 'trading_strategy_name', v_old.trading_strategy_name),
      'after', jsonb_build_object('trading_status', p_trading_status, 'trading_strategy_name', case when p_trading_status = 'active' then nullif(trim(p_trading_strategy_name), '') else null end)));
end $$;

/* ---------- privileges: signed-in callers only ---------- */

revoke all on function public.client_submit_deposit(numeric, text, text, text, text) from public, anon;
revoke all on function public.client_request_withdrawal(numeric, text, text, text, text) from public, anon;
revoke all on function public.admin_adjust_balance(uuid, text, text, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.admin_update_client(uuid, text, text, text, timestamptz) from public, anon;
revoke all on function public.admin_set_trading_status(uuid, text, text, timestamptz) from public, anon;
revoke all on function public._check_idempotency_key(text) from public, anon;
grant execute on function public.client_submit_deposit(numeric, text, text, text, text) to authenticated;
grant execute on function public.client_request_withdrawal(numeric, text, text, text, text) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, text, text, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.admin_update_client(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_set_trading_status(uuid, text, text, timestamptz) to authenticated;
grant execute on function public._check_idempotency_key(text) to authenticated;

/* ---------- follow-up (applied as harden_legacy_withdrawal_and_search_path) ---------- */

alter function public._check_idempotency_key(text) set search_path = public;

-- Legacy, unused by the app: moves funds from available to pending at request
-- time, which the current review flow (admin_review_transaction) would then
-- deduct a second time. Kept in place but no longer callable directly by
-- clients; client_request_withdrawal is the supported path.
revoke execute on function public.request_withdrawal(numeric, text, text) from authenticated, anon, public;

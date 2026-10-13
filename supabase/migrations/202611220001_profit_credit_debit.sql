-- Manual Profit Credit upgrade + Manual Profit Debit + historical-date workflow.
--
-- Additive and backward compatible:
--   * two new transaction sources (profit_debit, profit_payout), as a superset;
--   * new nullable columns on manual_profit_credits (existing rows unchanged);
--   * a new admin-only manual_profit_debits table;
--   * new functions; admin_manual_profit_credit keeps its signature and now
--     applies the same rules through admin_manual_profit_credit_v2.
-- Rollback: the old admin_manual_profit_credit body is in
-- 202611190001_manual_profit_credit.sql; the new tables/columns can stay
-- (nothing reads them unless the new code does).
--
-- Rules shared by credits and debits:
--   * effective date: the date the entry applies to; never in the future,
--     never before 2000. The posting time (created_at) is always the real time.
--   * an earlier date (historical entry) needs a written reason AND a
--     supporting reference or evidence file.
--   * a date before the client's account was opened is a documented
--     exception: it needs explicit confirmation and an accounting basis. The
--     account-opening date is never changed.
--   * an external reference can be used once per client (duplicate guard),
--     on top of the request key (idempotency).
--   * every entry is one database transaction: ledger row, balance, admin
--     record, audit entry and the client notification (one per transaction).

-- 1. Sources -----------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'transactions_source_check';
  if v_def is null or position('profit_payout' in v_def) = 0 then
    alter table public.transactions drop constraint if exists transactions_source_check;
    alter table public.transactions add constraint transactions_source_check check (source is null or source = any (array[
      'client_deposit', 'admin_funding', 'admin_debit', 'profit_adjustment', 'balance_adjustment', 'investment_principal',
      'investment_profit', 'withdrawal', 'fee', 'transfer', 'reversal', 'loyalty_reward', 'promotional_credit',
      'profit_correction', 'reconciliation', 'profit_distribution', 'profit_allocation', 'profit_debit', 'profit_payout']));
  end if;
end $$;

-- 2. Credit record: new optional details --------------------------------------
alter table public.manual_profit_credits
  add column if not exists external_reference text,
  add column if not exists evidence_path text,
  add column if not exists internal_note text,
  add column if not exists pre_opening_exception boolean not null default false,
  add column if not exists exception_basis text,
  add column if not exists reverses_transaction_id uuid references public.transactions(id);
do $$ begin
  alter table public.manual_profit_credits drop constraint if exists manual_profit_credits_classification_check;
  alter table public.manual_profit_credits add constraint manual_profit_credits_classification_check
    check (classification in ('investment_return', 'profit_distribution', 'profit_allocation', 'debit_reversal'));
end $$;

-- 3. Debit record --------------------------------------------------------------
create table if not exists public.manual_profit_debits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id),
  user_id uuid not null references public.profiles(id),
  admin_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'USD',
  category text not null check (category in ('credit_reversal', 'balance_correction', 'payout', 'authorized_charge', 'other')),
  description text not null,                 -- shown to the client
  internal_note text,                        -- admin only
  external_reference text,
  evidence_path text,
  backdate_reason text,
  pre_opening_exception boolean not null default false,
  exception_basis text,
  reverses_transaction_id uuid references public.transactions(id),
  effective_at timestamptz not null,
  posted_at timestamptz not null default now(),
  profit_balance_before numeric(18, 2) not null,
  profit_balance_after numeric(18, 2) not null,
  pending_withdrawals numeric(18, 2) not null default 0,
  idempotency_key text not null,
  unique (user_id, idempotency_key),
  check ((category = 'credit_reversal') = (reverses_transaction_id is not null))
);
create index if not exists manual_profit_debits_user_idx on public.manual_profit_debits (user_id, posted_at desc);
alter table public.manual_profit_debits enable row level security;
revoke all on public.manual_profit_debits from anon, authenticated;
grant select on public.manual_profit_debits to authenticated;
do $$ begin
  create policy manual_profit_debits_select_admin on public.manual_profit_debits for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;

-- 4. Shared rules ---------------------------------------------------------------
-- Effective date, historical-entry and pre-opening-exception checks. Returns
-- the effective timestamp (today → now; earlier → noon of that day in the
-- admin's time zone) and whether the entry is historical / an exception.
create or replace function public._manual_profit_dates(
  p_user_id uuid, p_effective_date date, p_tz_offset_min integer, p_backdate_reason text,
  p_has_support boolean, p_exception_ack boolean, p_exception_basis text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date; v_opened date; v_backdated boolean; v_pre boolean;
  v_backdate text := btrim(regexp_replace(coalesce(p_backdate_reason, ''), '\s+', ' ', 'g'));
  v_basis text := btrim(regexp_replace(coalesce(p_exception_basis, ''), '\s+', ' ', 'g'));
begin
  if p_tz_offset_min is null or p_tz_offset_min not between -840 and 840 then raise exception 'Invalid time zone'; end if;
  if p_effective_date is null then raise exception 'Choose an effective date'; end if;
  v_today := ((now() at time zone 'UTC') - make_interval(mins => p_tz_offset_min))::date;
  if p_effective_date > v_today then raise exception 'The effective date cannot be in the future'; end if;
  if p_effective_date < date '2000-01-01' then raise exception 'Check the effective date'; end if;
  select (created_at at time zone 'UTC' - make_interval(mins => p_tz_offset_min))::date into v_opened from public.profiles where id = p_user_id;
  v_backdated := p_effective_date < v_today;
  v_pre := v_opened is not null and p_effective_date < v_opened;
  if v_backdated then
    if char_length(v_backdate) < 10 then
      raise exception 'Explain why this entry applies to an earlier date (at least 10 characters)';
    end if;
    if not coalesce(p_has_support, false) then
      raise exception 'A historical entry needs a supporting reference or an evidence file';
    end if;
  end if;
  if v_pre then
    if not coalesce(p_exception_ack, false) or char_length(v_basis) < 20 then
      raise exception 'The effective date is before this client''s account was opened (%). Confirm the pre-opening exception and explain the accounting basis (at least 20 characters), or record the entry against the correct account.',
        to_char(v_opened, 'FMMonth FMDD, YYYY');
    end if;
  end if;
  return jsonb_build_object(
    'effective_at', case when v_backdated then ((p_effective_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC' else now() end,
    'backdated', v_backdated, 'pre_opening', v_pre, 'opened', v_opened, 'today', v_today,
    'backdate_reason', nullif(v_backdate, ''), 'exception_basis', case when v_pre then v_basis end);
end $$;
revoke all on function public._manual_profit_dates(uuid, date, integer, text, boolean, boolean, text) from public, anon, authenticated;

-- An evidence file must be in the private evidence bucket.
create or replace function public._manual_profit_evidence(p_path text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if v is null then return null; end if;
  if v !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{8,100}\.(pdf|jpg|png|webp)$' then raise exception 'Invalid evidence file'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'historical-evidence' and name = v) then
    raise exception 'The evidence file was not found; upload it again';
  end if;
  return v;
end $$;
revoke all on function public._manual_profit_evidence(text) from public, anon, authenticated;

-- An external reference is used once per client across credits and debits.
create or replace function public._manual_profit_reference_used(p_user_id uuid, p_reference text)
returns text language sql stable security definer set search_path = public as $$
  select t.reference from (
    select transaction_id from public.manual_profit_credits where user_id = p_user_id and lower(external_reference) = lower(btrim(p_reference))
    union all
    select transaction_id from public.manual_profit_debits where user_id = p_user_id and lower(external_reference) = lower(btrim(p_reference))
  ) x join public.transactions t on t.id = x.transaction_id limit 1
$$;
revoke all on function public._manual_profit_reference_used(uuid, text) from public, anon, authenticated;

-- Client notification text (no administrator details).
create or replace function public._manual_profit_notice(p_kind text, p_name text, p_amount numeric, p_date text, p_description text)
returns text language sql immutable set search_path = public as $$
  select 'Dear ' || coalesce(nullif(btrim(p_name), ''), 'Client') || E',\n\n'
    || case when p_kind = 'credit'
         then 'A profit credit of USD ' || to_char(p_amount, 'FM999,999,999,990.00') || ' has been recorded in your Tarafab.XAi account.'
         else 'A debit of USD ' || to_char(p_amount, 'FM999,999,999,990.00') || ' has been recorded against your Tarafab.XAi profit balance.' end
    || E'\n\nEffective date: ' || p_date
    || E'\n\nDescription: ' || p_description
    || E'\n\nPlease review your account activity for the transaction details and updated balance.'
    || case when p_kind = 'credit' then '' else ' If you believe this entry is incorrect, contact customer support for clarification.' end
    || E'\n\nFor assistance, visit https://tarafabxai.xyz/'
    || E'\n\nKind regards,\nTarafab.XAi Client Services'
$$;

-- 5. Manual Profit Credit (v2) ----------------------------------------------------
create or replace function public.admin_manual_profit_credit_v2(
  p_user_id uuid, p_amount numeric, p_effective_date date, p_classification text, p_description text,
  p_idempotency_key text, p_investment_id uuid default null, p_backdate_reason text default null,
  p_tz_offset_min integer default 0, p_external_reference text default null, p_evidence_path text default null,
  p_internal_note text default null, p_exception_ack boolean default false, p_exception_basis text default null,
  p_reverses_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_desc text := btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
  v_ref text := nullif(btrim(regexp_replace(coalesce(p_external_reference, ''), '\s+', ' ', 'g')), '');
  v_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_ev text; v_dates jsonb; v_effective timestamptz; v_backdated boolean; v_pre boolean; v_used text;
  v_existing public.manual_profit_credits; v_client public.profiles; v_acc public.accounts; v_inv public.client_investments;
  v_adj public.investment_profit_adjustments; v_tx public.transactions; v_rev public.transactions; v_rev_left numeric;
  v_before numeric; v_after numeric; v_src text; v_row public.manual_profit_credits; v_date_text text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if v_key is null then raise exception 'Missing request key'; end if;

  -- A repeated request (double tap, retry) returns the credit already posted.
  select * into v_existing from public.manual_profit_credits where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.transaction_id,
      'reference', (select reference from public.transactions where id = v_existing.transaction_id),
      'amount', v_existing.amount, 'currency', v_existing.currency, 'classification', v_existing.classification,
      'effective_at', v_existing.effective_at, 'posted_at', v_existing.posted_at,
      'profit_balance_before', v_existing.profit_balance_before, 'profit_balance_after', v_existing.profit_balance_after);
  end if;

  select * into v_client from public.profiles where id = p_user_id;
  if not found or coalesce(v_client.role, 'customer') <> 'customer' then raise exception 'Choose an existing client account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Enter an amount with at most 2 decimal places'; end if;
  if p_amount > 100000000 then raise exception 'The amount is too large for a single credit'; end if;
  if p_classification not in ('investment_return', 'profit_distribution', 'profit_allocation', 'debit_reversal') then
    raise exception 'Choose what this credit is';
  end if;
  if char_length(v_desc) < 5 then raise exception 'Enter a description (at least 5 characters)'; end if;
  if char_length(v_desc) > 500 then raise exception 'Keep the description under 500 characters'; end if;
  if v_ref is not null and char_length(v_ref) > 120 then raise exception 'The reference is too long'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'Keep the internal note under 1000 characters'; end if;
  v_ev := public._manual_profit_evidence(p_evidence_path);

  v_dates := public._manual_profit_dates(p_user_id, p_effective_date, p_tz_offset_min, p_backdate_reason,
    v_ref is not null or v_ev is not null, p_exception_ack, p_exception_basis);
  v_effective := (v_dates->>'effective_at')::timestamptz;
  v_backdated := (v_dates->>'backdated')::boolean;
  v_pre := (v_dates->>'pre_opening')::boolean;

  if p_classification = 'investment_return' then
    if p_investment_id is null then raise exception 'Choose the investment this return belongs to'; end if;
    select * into v_inv from public.client_investments where id = p_investment_id and user_id = p_user_id;
    if not found then raise exception 'That investment does not belong to this client'; end if;
    if v_inv.status not in ('active', 'completed', 'matured') then
      raise exception 'A return can only be recorded on an active or completed investment';
    end if;
  elsif p_investment_id is not null then
    raise exception 'Only an investment return is linked to an investment';
  end if;

  select * into v_acc from public.accounts where user_id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select * into v_existing from public.manual_profit_credits where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.transaction_id,
      'reference', (select reference from public.transactions where id = v_existing.transaction_id),
      'amount', v_existing.amount, 'currency', v_existing.currency, 'classification', v_existing.classification,
      'effective_at', v_existing.effective_at, 'posted_at', v_existing.posted_at,
      'profit_balance_before', v_existing.profit_balance_before, 'profit_balance_after', v_existing.profit_balance_after);
  end if;
  if v_ref is not null then
    v_used := public._manual_profit_reference_used(p_user_id, v_ref);
    if v_used is not null then raise exception 'This reference was already used for %. Review that entry instead of posting it again.', v_used; end if;
  end if;

  -- Correction of an earlier manual debit: linked to it, never more than is left.
  if p_classification = 'debit_reversal' then
    select t.* into v_rev from public.transactions t join public.manual_profit_debits d on d.transaction_id = t.id
     where t.user_id = p_user_id and lower(t.reference) = lower(btrim(coalesce(p_reverses_reference, '')));
    if not found then raise exception 'Enter the reference of the manual profit debit this corrects'; end if;
    select v_rev.amount - coalesce(sum(c.amount), 0) into v_rev_left from public.manual_profit_credits c where c.reverses_transaction_id = v_rev.id;
    if p_amount > v_rev_left then raise exception 'Only % of that debit is left to correct', to_char(v_rev_left, 'FM999,999,999,990.00'); end if;
    if v_effective < v_rev.effective_at then raise exception 'A correction cannot be dated before the entry it corrects'; end if;
  elsif nullif(btrim(coalesce(p_reverses_reference, '')), '') is not null then
    raise exception 'Only a correction of an earlier debit refers to another entry';
  end if;
  v_before := v_acc.profit_balance;

  if p_classification = 'investment_return' then
    v_adj := public.admin_set_investment_profit(v_inv.id, v_inv.profit_amount + p_amount, v_desc, v_key);
    select * into v_tx from public.transactions where id = v_adj.transaction_id;
    if v_backdated then
      update public.transactions set effective_at = v_effective where id = v_tx.id returning * into v_tx;
    end if;
  else
    v_src := case p_classification when 'debit_reversal' then 'profit_correction' else p_classification end;
    update public.accounts set profit_balance = profit_balance + p_amount, updated_at = now() where id = v_acc.id;
    insert into public.transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key, source, effective_at)
    values (p_user_id, 'adjustment', 'profit_balance', p_amount, 'credit', 'completed',
            'PRF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_desc, v_key, v_src, v_effective)
    returning * into v_tx;
  end if;
  select profit_balance into v_after from public.accounts where id = v_acc.id;

  insert into public.manual_profit_credits (transaction_id, user_id, admin_id, amount, currency, classification, investment_id,
    reason, backdate_reason, effective_at, posted_at, profit_balance_before, profit_balance_after, idempotency_key,
    external_reference, evidence_path, internal_note, pre_opening_exception, exception_basis, reverses_transaction_id)
  values (v_tx.id, p_user_id, v_admin, p_amount, 'USD', p_classification, p_investment_id,
    v_desc, v_dates->>'backdate_reason', v_tx.effective_at, v_tx.created_at, v_before, v_after, v_key,
    v_ref, v_ev, v_note, v_pre, v_dates->>'exception_basis', v_rev.id)
  returning * into v_row;

  perform public._audit('MANUAL_PROFIT_CREDIT', p_user_id, 'transaction', v_tx.id::text, jsonb_build_object(
    'record_id', v_row.id, 'reference', v_tx.reference, 'amount', p_amount, 'currency', 'USD', 'classification', p_classification,
    'investment_id', p_investment_id, 'investment_reference', v_inv.reference, 'description', v_desc, 'internal_note', v_note,
    'external_reference', v_ref, 'evidence_path', v_ev, 'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at,
    'historical', v_backdated, 'backdate_reason', v_dates->>'backdate_reason',
    'pre_opening_exception', v_pre, 'exception_basis', v_dates->>'exception_basis', 'account_opened', v_dates->>'opened',
    'reverses_reference', v_rev.reference, 'profit_balance_before', v_before, 'profit_balance_after', v_after, 'status', 'posted'));

  -- The notification commits with the ledger entry, once per transaction.
  v_date_text := to_char(v_tx.effective_at at time zone 'UTC' - make_interval(mins => p_tz_offset_min), 'FMMonth FMDD, YYYY');
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by, investment_id, transaction_id)
  values (p_user_id, 'account', 'Profit Credit Notification',
          public._manual_profit_notice('credit', v_client.full_name, p_amount, v_date_text, v_desc),
          'View activity', '#transactions', v_admin, p_investment_id, v_tx.id)
  on conflict (transaction_id) where transaction_id is not null do nothing;

  return jsonb_build_object('duplicate', false, 'transaction_id', v_tx.id, 'reference', v_tx.reference,
    'amount', p_amount, 'currency', 'USD', 'classification', p_classification,
    'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at, 'historical', v_backdated, 'pre_opening_exception', v_pre,
    'profit_balance_before', v_before, 'profit_balance_after', v_after);
end $$;
revoke all on function public.admin_manual_profit_credit_v2(uuid, numeric, date, text, text, text, uuid, text, integer, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.admin_manual_profit_credit_v2(uuid, numeric, date, text, text, text, uuid, text, integer, text, text, text, boolean, text, text) to authenticated;

-- The original entry point keeps its signature and now follows the same rules.
create or replace function public.admin_manual_profit_credit(
  p_user_id uuid, p_amount numeric, p_effective_date date, p_classification text, p_reason text,
  p_idempotency_key text, p_investment_id uuid default null, p_backdate_reason text default null,
  p_tz_offset_min integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.admin_manual_profit_credit_v2(p_user_id, p_amount, p_effective_date, p_classification, p_reason,
    p_idempotency_key, p_investment_id, p_backdate_reason, p_tz_offset_min);
end $$;

-- 6. Manual Profit Debit ------------------------------------------------------------
-- Takes a documented amount off the profit balance only. Never touches
-- investments, deposits, withdrawals or other balances. The amount must fit
-- in the profit balance after amounts already requested for withdrawal.
create or replace function public.admin_manual_profit_debit(
  p_user_id uuid, p_amount numeric, p_effective_date date, p_category text, p_description text,
  p_idempotency_key text, p_backdate_reason text default null, p_tz_offset_min integer default 0,
  p_external_reference text default null, p_evidence_path text default null, p_internal_note text default null,
  p_exception_ack boolean default false, p_exception_basis text default null, p_reverses_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_desc text := btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
  v_ref text := nullif(btrim(regexp_replace(coalesce(p_external_reference, ''), '\s+', ' ', 'g')), '');
  v_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_ev text; v_dates jsonb; v_effective timestamptz; v_backdated boolean; v_pre boolean; v_used text;
  v_existing public.manual_profit_debits; v_client public.profiles; v_acc public.accounts;
  v_rev public.transactions; v_rev_left numeric; v_pending numeric; v_available numeric;
  v_tx public.transactions; v_row public.manual_profit_debits; v_src text; v_date_text text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if v_key is null then raise exception 'Missing request key'; end if;

  select * into v_existing from public.manual_profit_debits where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.transaction_id,
      'reference', (select reference from public.transactions where id = v_existing.transaction_id),
      'amount', v_existing.amount, 'currency', v_existing.currency, 'category', v_existing.category,
      'effective_at', v_existing.effective_at, 'posted_at', v_existing.posted_at,
      'profit_balance_before', v_existing.profit_balance_before, 'profit_balance_after', v_existing.profit_balance_after);
  end if;

  select * into v_client from public.profiles where id = p_user_id;
  if not found or coalesce(v_client.role, 'customer') <> 'customer' then raise exception 'Choose an existing client account'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Enter an amount with at most 2 decimal places'; end if;
  if p_amount > 100000000 then raise exception 'The amount is too large for a single debit'; end if;
  if p_category not in ('credit_reversal', 'balance_correction', 'payout', 'authorized_charge', 'other') then
    raise exception 'Choose what this debit is';
  end if;
  if char_length(v_desc) < 5 then raise exception 'Enter a description (at least 5 characters)'; end if;
  if char_length(v_desc) > 500 then raise exception 'Keep the description under 500 characters'; end if;
  if v_ref is not null and char_length(v_ref) > 120 then raise exception 'The reference is too long'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'Keep the internal note under 1000 characters'; end if;
  -- "Other" and charges must be traceable to a document.
  if p_category in ('authorized_charge', 'other', 'payout') and v_ref is null and nullif(btrim(coalesce(p_evidence_path, '')), '') is null then
    raise exception 'This kind of debit needs a supporting reference or an evidence file';
  end if;
  v_ev := public._manual_profit_evidence(p_evidence_path);

  v_dates := public._manual_profit_dates(p_user_id, p_effective_date, p_tz_offset_min, p_backdate_reason,
    v_ref is not null or v_ev is not null or p_category = 'credit_reversal', p_exception_ack, p_exception_basis);
  v_effective := (v_dates->>'effective_at')::timestamptz;
  v_backdated := (v_dates->>'backdated')::boolean;
  v_pre := (v_dates->>'pre_opening')::boolean;

  -- One debit per client at a time: the account row lock serialises them.
  select * into v_acc from public.accounts where user_id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select * into v_existing from public.manual_profit_debits where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.transaction_id,
      'reference', (select reference from public.transactions where id = v_existing.transaction_id),
      'amount', v_existing.amount, 'currency', v_existing.currency, 'category', v_existing.category,
      'effective_at', v_existing.effective_at, 'posted_at', v_existing.posted_at,
      'profit_balance_before', v_existing.profit_balance_before, 'profit_balance_after', v_existing.profit_balance_after);
  end if;
  if v_ref is not null then
    v_used := public._manual_profit_reference_used(p_user_id, v_ref);
    if v_used is not null then raise exception 'This reference was already used for %. Review that entry instead of posting it again.', v_used; end if;
  end if;

  -- Reversal of an earlier profit credit: linked to it, never more than is left.
  if p_category = 'credit_reversal' then
    select * into v_rev from public.transactions
     where user_id = p_user_id and lower(reference) = lower(btrim(coalesce(p_reverses_reference, '')))
       and method = 'profit_balance' and direction = 'credit' and status = 'completed';
    if not found then raise exception 'Enter the reference of the profit credit this reverses'; end if;
    if v_rev.source = 'investment_profit' then
      raise exception 'This is an investment return. Change it with Edit profit / return on the investment so the investment stays consistent.';
    end if;
    select v_rev.amount - coalesce(sum(d.amount), 0) into v_rev_left from public.manual_profit_debits d where d.reverses_transaction_id = v_rev.id;
    if p_amount > v_rev_left then raise exception 'Only % of that credit is left to reverse', to_char(v_rev_left, 'FM999,999,999,990.00'); end if;
    if v_effective < v_rev.effective_at then raise exception 'A reversal cannot be dated before the credit it reverses'; end if;
  elsif nullif(btrim(coalesce(p_reverses_reference, '')), '') is not null then
    raise exception 'Only a reversal refers to an earlier credit';
  end if;

  -- Amounts already requested for withdrawal from the profit balance stay reserved.
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = p_user_id and type = 'withdrawal' and method = 'profit_balance'
     and status in ('pending_review', 'pending', 'requested', 'under_review');
  v_available := v_acc.profit_balance - v_pending;
  if p_amount > v_available then
    raise exception 'The debit is more than the available profit balance (% available%)',
      to_char(greatest(v_available, 0), 'FM999,999,999,990.00'),
      case when v_pending > 0 then ', after ' || to_char(v_pending, 'FM999,999,999,990.00') || ' requested for withdrawal' else '' end;
  end if;

  v_src := case p_category when 'payout' then 'profit_payout' when 'authorized_charge' then 'profit_debit' when 'other' then 'profit_debit' else 'profit_correction' end;
  update public.accounts set profit_balance = profit_balance - p_amount, updated_at = now() where id = v_acc.id;
  insert into public.transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key, source, effective_at)
  values (p_user_id, 'adjustment', 'profit_balance', p_amount, 'debit', 'completed',
          'PDB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_desc, v_key, v_src, v_effective)
  returning * into v_tx;

  insert into public.manual_profit_debits (transaction_id, user_id, admin_id, amount, currency, category, description, internal_note,
    external_reference, evidence_path, backdate_reason, pre_opening_exception, exception_basis, reverses_transaction_id,
    effective_at, posted_at, profit_balance_before, profit_balance_after, pending_withdrawals, idempotency_key)
  values (v_tx.id, p_user_id, v_admin, p_amount, 'USD', p_category, v_desc, v_note,
    v_ref, v_ev, v_dates->>'backdate_reason', v_pre, v_dates->>'exception_basis', v_rev.id,
    v_tx.effective_at, v_tx.created_at, v_acc.profit_balance, v_acc.profit_balance - p_amount, v_pending, v_key)
  returning * into v_row;

  perform public._audit('MANUAL_PROFIT_DEBIT', p_user_id, 'transaction', v_tx.id::text, jsonb_build_object(
    'record_id', v_row.id, 'reference', v_tx.reference, 'amount', p_amount, 'currency', 'USD', 'category', p_category,
    'source', v_src, 'description', v_desc, 'internal_note', v_note, 'external_reference', v_ref, 'evidence_path', v_ev,
    'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at, 'historical', v_backdated,
    'backdate_reason', v_dates->>'backdate_reason', 'pre_opening_exception', v_pre, 'exception_basis', v_dates->>'exception_basis',
    'account_opened', v_dates->>'opened', 'reverses_reference', v_rev.reference,
    'profit_balance_before', v_acc.profit_balance, 'profit_balance_after', v_acc.profit_balance - p_amount,
    'pending_withdrawals', v_pending, 'status', 'posted'));

  v_date_text := to_char(v_tx.effective_at at time zone 'UTC' - make_interval(mins => p_tz_offset_min), 'FMMonth FMDD, YYYY');
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by, transaction_id)
  values (p_user_id, 'account', 'Profit Balance Update',
          public._manual_profit_notice('debit', v_client.full_name, p_amount, v_date_text, v_desc),
          'View activity', '#transactions', v_admin, v_tx.id)
  on conflict (transaction_id) where transaction_id is not null do nothing;

  return jsonb_build_object('duplicate', false, 'transaction_id', v_tx.id, 'reference', v_tx.reference,
    'amount', p_amount, 'currency', 'USD', 'category', p_category, 'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at,
    'historical', v_backdated, 'pre_opening_exception', v_pre,
    'profit_balance_before', v_acc.profit_balance, 'profit_balance_after', v_acc.profit_balance - p_amount);
end $$;
revoke all on function public.admin_manual_profit_debit(uuid, numeric, date, text, text, text, text, integer, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.admin_manual_profit_debit(uuid, numeric, date, text, text, text, text, integer, text, text, text, boolean, text, text) to authenticated;

-- 7. Snapshot for the confirmation screens (read-only, admin only) ----------------
create or replace function public.admin_profit_balance_snapshot(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc public.accounts; v_pending numeric;
begin
  perform public._require_admin();
  select * into v_acc from public.accounts where user_id = p_user_id;
  if not found then raise exception 'Account not found'; end if;
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = p_user_id and type = 'withdrawal' and method = 'profit_balance'
     and status in ('pending_review', 'pending', 'requested', 'under_review');
  return jsonb_build_object(
    'profit_balance', v_acc.profit_balance, 'pending_withdrawals', v_pending,
    'available_for_debit', greatest(v_acc.profit_balance - v_pending, 0),
    'account_opened_at', (select created_at from public.profiles where id = p_user_id),
    -- Profit credits that can be reversed (not investment returns), with what is left.
    'reversible_credits', coalesce((select jsonb_agg(x order by x->>'effective_at' desc) from (
        select jsonb_build_object('reference', t.reference, 'amount', t.amount, 'source', t.source, 'effective_at', t.effective_at,
          'remaining', t.amount - coalesce((select sum(d.amount) from public.manual_profit_debits d where d.reverses_transaction_id = t.id), 0)) x
          from public.transactions t
         where t.user_id = p_user_id and t.method = 'profit_balance' and t.direction = 'credit' and t.status = 'completed'
           and coalesce(t.source, '') <> 'investment_profit' and t.reference is not null
         order by t.effective_at desc limit 50) s where (x->>'remaining')::numeric > 0), '[]'::jsonb),
    -- Manual debits that can be corrected by a credit, with what is left.
    'correctable_debits', coalesce((select jsonb_agg(x order by x->>'effective_at' desc) from (
        select jsonb_build_object('reference', t.reference, 'amount', d.amount, 'category', d.category, 'effective_at', d.effective_at,
          'remaining', d.amount - coalesce((select sum(c.amount) from public.manual_profit_credits c where c.reverses_transaction_id = t.id), 0)) x
          from public.manual_profit_debits d join public.transactions t on t.id = d.transaction_id
         where d.user_id = p_user_id order by d.effective_at desc limit 50) s where (x->>'remaining')::numeric > 0), '[]'::jsonb));
end $$;
revoke all on function public.admin_profit_balance_snapshot(uuid) from public, anon;
grant execute on function public.admin_profit_balance_snapshot(uuid) to authenticated;

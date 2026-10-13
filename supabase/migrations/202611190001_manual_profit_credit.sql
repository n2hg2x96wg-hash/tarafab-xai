-- Manual Profit Credit (admin), with a required effective date.
--
-- Additive and backward compatible:
-- * two new transaction sources (the check is replaced by a superset):
--     profit_distribution → client sees "Profit distribution"
--     profit_allocation   → client sees "Profit credit received"
--   A verified investment return is NOT one of these: it is posted through
--   the existing admin_set_investment_profit, linked to that investment
--   (source investment_profit), exactly like every other investment return.
-- * new table manual_profit_credits: the admin record of each credit
--   (admin, classification, reason, effective date, posting time, balance
--   before/after). Admins only; clients have no access.
-- * new nullable column client_notifications.transaction_id with a unique
--   index, so one transaction can never produce two notifications.
-- * new function admin_manual_profit_credit.
-- No existing row is changed.
--
-- Dates: transactions.created_at is the server's posting time and is never
-- changed; transactions.effective_at is the business date the client sees
-- (see 202610150001). Both are kept, and both are copied to the admin record.
-- Balances follow the existing rule for profit-balance credits
-- (admin_adjust_balance on profit_balance): profit_balance only.

do $$ begin
  alter table public.transactions drop constraint if exists transactions_source_check;
  alter table public.transactions add constraint transactions_source_check check (source is null or source in (
    'client_deposit', 'admin_funding', 'admin_debit', 'profit_adjustment', 'balance_adjustment',
    'investment_principal', 'investment_profit', 'withdrawal', 'fee', 'transfer', 'reversal',
    'loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation',
    'profit_distribution', 'profit_allocation'
  ));
end $$;

create table if not exists public.manual_profit_credits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id),
  user_id uuid not null references public.profiles(id),
  admin_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'USD',
  classification text not null check (classification in ('investment_return', 'profit_distribution', 'profit_allocation')),
  investment_id uuid references public.client_investments(id),
  reason text not null,
  backdate_reason text,
  effective_at timestamptz not null,
  posted_at timestamptz not null default now(),
  profit_balance_before numeric(18, 2),
  profit_balance_after numeric(18, 2),
  idempotency_key text not null,
  unique (user_id, idempotency_key),
  check ((classification = 'investment_return') = (investment_id is not null))
);
create index if not exists manual_profit_credits_user_idx on public.manual_profit_credits (user_id, posted_at desc);
create index if not exists manual_profit_credits_posted_idx on public.manual_profit_credits (posted_at desc);
alter table public.manual_profit_credits enable row level security;
revoke all on table public.manual_profit_credits from anon, authenticated;
grant select on table public.manual_profit_credits to authenticated;
create policy manual_profit_credits_select_admin on public.manual_profit_credits
  for select to authenticated using (public.is_admin());

alter table public.client_notifications add column if not exists transaction_id uuid references public.transactions(id);
create unique index if not exists client_notifications_transaction_unique
  on public.client_notifications (transaction_id) where transaction_id is not null;

-- p_effective_date is the admin's calendar date; p_tz_offset_min is the
-- admin's UTC offset in minutes (JavaScript getTimezoneOffset: UTC − local),
-- so "today" means the admin's today. Today posts at the posting time; an
-- earlier date posts at noon of that date (admin's time zone) and needs a
-- written justification. Future dates are refused.
create or replace function public.admin_manual_profit_credit(
  p_user_id uuid, p_amount numeric, p_effective_date date, p_classification text, p_reason text,
  p_idempotency_key text, p_investment_id uuid default null, p_backdate_reason text default null,
  p_tz_offset_min integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_backdate text := nullif(btrim(regexp_replace(coalesce(p_backdate_reason, ''), '\s+', ' ', 'g')), '');
  v_local_today date; v_effective timestamptz; v_backdated boolean;
  v_existing public.manual_profit_credits; v_client public.profiles; v_acc public.accounts; v_inv public.client_investments;
  v_adj public.investment_profit_adjustments; v_tx public.transactions; v_before numeric; v_after numeric;
  v_src text; v_ref text; v_title text; v_body text; v_amount_text text; v_date_text text; v_row public.manual_profit_credits;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
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
  if p_classification not in ('investment_return', 'profit_distribution', 'profit_allocation') then
    raise exception 'Choose what this credit is';
  end if;
  if char_length(v_reason) < 5 then raise exception 'Enter a reason or reference (at least 5 characters)'; end if;
  if char_length(v_reason) > 500 then raise exception 'Keep the reason under 500 characters'; end if;

  if p_effective_date is null then raise exception 'Choose an effective date'; end if;
  if p_tz_offset_min is null or p_tz_offset_min not between -840 and 840 then raise exception 'Invalid time zone'; end if;
  v_local_today := ((now() at time zone 'UTC') - make_interval(mins => p_tz_offset_min))::date;
  if p_effective_date > v_local_today then raise exception 'The effective date cannot be in the future'; end if;
  if p_effective_date < date '2020-01-01' or p_effective_date < (v_client.created_at at time zone 'UTC')::date - 1 then
    raise exception 'The effective date cannot be before the client''s account was opened';
  end if;
  v_backdated := p_effective_date < v_local_today;
  if v_backdated and char_length(coalesce(v_backdate, '')) < 5 then
    raise exception 'Explain why the effective date is earlier than today (at least 5 characters)';
  end if;
  v_effective := case when v_backdated
    then ((p_effective_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC'
    else now() end;

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
  -- Two identical requests at the same moment: the second waits for the lock
  -- above, then finds the first one's credit and returns it.
  select * into v_existing from public.manual_profit_credits where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.transaction_id,
      'reference', (select reference from public.transactions where id = v_existing.transaction_id),
      'amount', v_existing.amount, 'currency', v_existing.currency, 'classification', v_existing.classification,
      'effective_at', v_existing.effective_at, 'posted_at', v_existing.posted_at,
      'profit_balance_before', v_existing.profit_balance_before, 'profit_balance_after', v_existing.profit_balance_after);
  end if;
  v_before := v_acc.profit_balance;

  if p_classification = 'investment_return' then
    -- The existing investment-return path: linked to the investment, source
    -- investment_profit, its own adjustment history and audit.
    v_adj := public.admin_set_investment_profit(v_inv.id, v_inv.profit_amount + p_amount, v_reason, v_key);
    select * into v_tx from public.transactions where id = v_adj.transaction_id;
    if v_backdated then
      update public.transactions set effective_at = v_effective where id = v_tx.id returning * into v_tx;
    end if;
  else
    v_src := p_classification;
    v_ref := 'PRF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    update public.accounts set profit_balance = profit_balance + p_amount, updated_at = now() where id = v_acc.id;
    insert into public.transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key, source, effective_at)
    values (p_user_id, 'adjustment', 'profit_balance', p_amount, 'credit', 'completed', v_ref, v_reason, v_key, v_src, v_effective)
    returning * into v_tx;
  end if;
  select profit_balance into v_after from public.accounts where id = v_acc.id;

  insert into public.manual_profit_credits (transaction_id, user_id, admin_id, amount, currency, classification, investment_id,
    reason, backdate_reason, effective_at, posted_at, profit_balance_before, profit_balance_after, idempotency_key)
  values (v_tx.id, p_user_id, v_admin, p_amount, 'USD', p_classification, p_investment_id,
    v_reason, case when v_backdated then v_backdate end, v_tx.effective_at, v_tx.created_at, v_before, v_after, v_key)
  returning * into v_row;

  perform public._audit('MANUAL_PROFIT_CREDIT', p_user_id, 'transaction', v_tx.id::text, jsonb_build_object(
    'reference', v_tx.reference, 'amount', p_amount, 'currency', 'USD', 'classification', p_classification,
    'investment_id', p_investment_id, 'investment_reference', v_inv.reference, 'reason', v_reason,
    'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at, 'backdated', v_backdated, 'backdate_reason', v_backdate,
    'profit_balance_before', v_before, 'profit_balance_after', v_after, 'record_id', v_row.id));

  -- The client's notification, in the same database transaction: it exists
  -- only if the credit committed, and the unique index allows one per credit.
  v_amount_text := to_char(p_amount, 'FM999,999,999,990.00') || ' USD';
  v_date_text := to_char(v_tx.effective_at at time zone 'UTC' - make_interval(mins => p_tz_offset_min), 'FMMonth FMDD, YYYY');
  if p_classification = 'investment_return' then
    v_title := 'Investment Return Recorded';
    v_body := 'A return of ' || v_amount_text || ' for investment ' || coalesce(v_inv.reference, 'your investment')
      || ' has been recorded in your Tarafab.XAi account.';
  elsif p_classification = 'profit_distribution' then
    v_title := 'Profit Distribution Recorded';
    v_body := 'A profit distribution of ' || v_amount_text || ' has been recorded in your Tarafab.XAi account.';
  else
    v_title := 'Profit Credit Recorded';
    v_body := 'A profit credit of ' || v_amount_text || ' has been recorded in your Tarafab.XAi account.';
  end if;
  v_body := v_body || E'\n\nEffective date: ' || v_date_text || E'\nReference: ' || v_tx.reference
    || E'\n\nYou can view the transaction in your account activity.';
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by, investment_id, transaction_id)
  values (p_user_id, 'account', v_title, v_body, 'View activity', '#transactions', v_admin, p_investment_id, v_tx.id)
  on conflict (transaction_id) where transaction_id is not null do nothing;

  return jsonb_build_object('duplicate', false, 'transaction_id', v_tx.id, 'reference', v_tx.reference,
    'amount', p_amount, 'currency', 'USD', 'classification', p_classification,
    'effective_at', v_tx.effective_at, 'posted_at', v_tx.created_at,
    'profit_balance_before', v_before, 'profit_balance_after', v_after);
end $$;

revoke all on function public.admin_manual_profit_credit(uuid, numeric, date, text, text, text, uuid, text, integer) from public, anon;
grant execute on function public.admin_manual_profit_credit(uuid, numeric, date, text, text, text, uuid, text, integer) to authenticated;

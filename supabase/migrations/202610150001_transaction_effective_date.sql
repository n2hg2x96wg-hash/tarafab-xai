-- Effective (business) date for transactions, set by admins; additive only.
--
-- effective_at is the date the client sees and sorts by. created_at stays the
-- untouched recording timestamp (internal/audit). Existing rows get
-- effective_at = created_at, so nothing appears to move. Balances are running
-- totals updated when an amount is applied, never recomputed from dates, so
-- changing a date cannot change any balance.
alter table public.transactions add column if not exists effective_at timestamptz;
update public.transactions set effective_at = created_at where effective_at is null;
alter table public.transactions alter column effective_at set default now();
alter table public.transactions alter column effective_at set not null;
create index if not exists transactions_user_effective_idx on public.transactions (user_id, effective_at desc);

-- Admin: set or change a transaction's effective date. Audited with previous
-- and new date, recording time, amount, type, reference and reason. Does not
-- change the amount, status, balances, created_at or updated_at.
create or replace function public.admin_set_transaction_effective_date(p_tx uuid, p_effective_at timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.transactions%rowtype; v_reason text := trim(coalesce(p_reason, ''));
begin
  perform public._require_admin();
  if p_effective_at is null then raise exception 'Enter an effective date.'; end if;
  if p_effective_at < timestamptz '2020-01-01' then raise exception 'The effective date is too far in the past.'; end if;
  if p_effective_at > now() + interval '5 minutes' then raise exception 'The effective date cannot be in the future.'; end if;
  if char_length(v_reason) < 3 then raise exception 'Enter a reason for the date change.'; end if;
  select * into t from public.transactions where id = p_tx for update;
  if not found then raise exception 'Transaction not found.'; end if;
  if t.effective_at = p_effective_at then
    return jsonb_build_object('transaction_id', t.id, 'effective_at', t.effective_at, 'changed', false);
  end if;
  update public.transactions set effective_at = p_effective_at where id = t.id;
  perform public._audit('TRANSACTION_EFFECTIVE_DATE_CHANGED', t.user_id, 'transaction', t.id::text, jsonb_build_object(
    'reference', t.reference, 'type', t.type, 'amount', t.amount, 'direction', t.direction, 'status', t.status,
    'previous_effective_at', t.effective_at, 'new_effective_at', p_effective_at, 'recorded_at', t.created_at,
    'reason', left(v_reason, 500)));
  return jsonb_build_object('transaction_id', t.id, 'effective_at', p_effective_at, 'changed', true);
end $$;

-- Admin: the existing balance adjustment, with an optional effective date,
-- in one database transaction (the adjustment and its date succeed or fail
-- together). admin_adjust_balance keeps its own locking, validation,
-- idempotency and audit; a repeated request does not re-date anything.
create or replace function public.admin_adjust_balance_effective(
  p_user_id uuid, p_field text, p_operation text, p_amount numeric, p_reason text,
  p_idempotency_key text, p_expected_updated_at timestamptz, p_effective_at timestamptz)
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric; v_tx uuid;
begin
  perform public._require_admin();
  v := public.admin_adjust_balance(p_user_id, p_field, p_operation, p_amount, p_reason, p_idempotency_key, p_expected_updated_at);
  if p_effective_at is not null then
    -- The row this call inserted (same database transaction => same now()).
    select id into v_tx from public.transactions
     where user_id = p_user_id and type = 'adjustment' and created_at = now()
     order by id limit 1;
    if v_tx is not null and abs(extract(epoch from (p_effective_at - now()))) > 60 then
      perform public.admin_set_transaction_effective_date(v_tx, p_effective_at, p_reason);
    end if;
  end if;
  return v;
end $$;

revoke all on function public.admin_set_transaction_effective_date(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_adjust_balance_effective(uuid, text, text, numeric, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_transaction_effective_date(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_adjust_balance_effective(uuid, text, text, numeric, text, text, timestamptz, timestamptz) to authenticated;

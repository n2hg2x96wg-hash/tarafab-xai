-- Admin balance actions by meaning (additive, non-destructive).
--
-- Admin balance changes were all written by admin_adjust_balance as type
-- 'adjustment'; 202611130001 records what each one meant in `source`
-- (admin_funding = Account Credit, admin_debit = Account Debit,
-- profit_adjustment, balance_adjustment). Two meanings had no way to be
-- recorded:
--
--   * a FEE charged by an admin — previously only possible as a generic debit,
--     so it read as an Account Debit. admin_apply_fee records it as a real fee
--     (type 'fee', source 'fee'), debiting the spendable balance exactly once
--     with the same locking, idempotency, stale-page and audit rules as
--     admin_adjust_balance.
--   * a REVERSAL — no workflow writes one today; the source value is allowed so
--     a future reversal can be recorded as such instead of as an adjustment.
--
-- No existing row, amount, balance, type or source is changed.

do $$ begin
  alter table public.transactions drop constraint if exists transactions_source_check;
  alter table public.transactions add constraint transactions_source_check check (source is null or source in (
    'client_deposit', 'admin_funding', 'admin_debit', 'profit_adjustment', 'balance_adjustment',
    'investment_principal', 'investment_profit', 'withdrawal', 'fee', 'transfer',
    'reversal'              -- a previous transaction intentionally undone
  ));
end $$;

create or replace function public.admin_apply_fee(
  p_user_id uuid, p_amount numeric, p_reason text,
  p_idempotency_key text default null, p_expected_updated_at timestamptz default null, p_effective_at timestamptz default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_old numeric; v_new numeric; v_updated timestamptz; v_tx uuid;
        v_key text := public._check_idempotency_key(p_idempotency_key);
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  select available_balance, updated_at into v_old, v_updated from public.accounts where user_id = p_user_id for update;
  if v_old is null then raise exception 'Account not found'; end if;

  if v_key is not null and exists (select 1 from public.transactions where user_id = p_user_id and idempotency_key = v_key) then
    return v_old;
  end if;
  if p_expected_updated_at is not null and v_updated is distinct from p_expected_updated_at then
    raise exception 'This account changed since you opened it. Refresh to view the latest balances.' using errcode = '40001';
  end if;

  v_new := round(v_old - p_amount, 2);
  if v_new < 0 then raise exception 'Resulting balance cannot be negative'; end if;
  update public.accounts set available_balance = v_new, updated_at = now() where user_id = p_user_id;

  insert into public.transactions (user_id, type, method, amount, status, reference, notes, direction, idempotency_key)
  values (p_user_id, 'fee', 'available_balance', round(p_amount, 2), 'completed',
          'FEE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), trim(p_reason), 'debit', v_key)
  returning id into v_tx;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_fee_applied', 'account', p_user_id::text,
          jsonb_build_object('admin_id', v_admin, 'target_user_id', p_user_id, 'field', 'available_balance', 'operation', 'fee',
                             'amount', p_amount, 'previous_value', v_old, 'new_value', v_new, 'reason', trim(p_reason), 'transaction_id', v_tx));

  if p_effective_at is not null and abs(extract(epoch from (p_effective_at - now()))) > 60 then
    perform public.admin_set_transaction_effective_date(v_tx, p_effective_at, p_reason);
  end if;
  return v_new;
end $$;

revoke all on function public.admin_apply_fee(uuid, numeric, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_apply_fee(uuid, numeric, text, text, timestamptz, timestamptz) to authenticated;

comment on function public.admin_apply_fee(uuid, numeric, text, text, timestamptz, timestamptz) is
  'Admin charges a fee: debits available_balance once and records a fee transaction (not an adjustment). Audited.';

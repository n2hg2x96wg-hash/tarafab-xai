-- Fix the root cause of "total_vs_parts" reconciliation discrepancies.
-- Additive and backward-compatible: no rows are deleted, no table is reset,
-- and the one-time correction below only touches the legacy account_balance
-- column, recording every change in audit_logs for a full audit trail.
--
-- Root causes found:
--   1. admin_review_transaction() decremented profit_balance on a
--      profit-balance withdrawal but never moved the legacy account_balance,
--      unlike the available_balance branch right next to it (which does).
--   2. admin_adjust_balance() updates exactly one balance column (whichever
--      field the admin picked) and never keeps account_balance - the
--      "sum of parts" - in sync when that field is not account_balance itself.
-- Both left account_balance permanently out of sync with
-- available_balance + invested_balance + pending_balance + profit_balance,
-- which is exactly what admin_reconciliation()'s total_vs_parts check flags.

-- 1. Withdrawal review: keep the legacy total in step with the real
--    profit_balance movement, mirroring the available_balance branch.
create or replace function public.admin_review_transaction(p_tx_id uuid, p_action text, p_reason text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_tx public.transactions; v_acc public.accounts; v_status text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Action must be approve or reject'; end if;
  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_tx.status not in ('pending_review', 'pending', 'requested', 'under_review') then
    raise exception 'This transaction was already %', replace(v_tx.status, '_', ' ');
  end if;
  if v_tx.type not in ('deposit', 'withdrawal') then raise exception 'Only deposits and withdrawals can be reviewed'; end if;
  if p_action = 'approve' then
    select * into v_acc from public.accounts where user_id = v_tx.user_id for update;
    if not found then raise exception 'Client account not found'; end if;
    if v_tx.type = 'deposit' then
      update public.accounts set account_balance = account_balance + v_tx.amount, available_balance = available_balance + v_tx.amount, updated_at = now() where id = v_acc.id;
    elsif v_tx.method = 'profit_balance' then
      if v_acc.profit_balance < v_tx.amount then raise exception 'Client profit balance is too low for this withdrawal'; end if;
      update public.accounts set profit_balance = profit_balance - v_tx.amount, account_balance = greatest(account_balance - v_tx.amount, 0), updated_at = now() where id = v_acc.id;
    else
      -- The spendable balance is the one that funds a withdrawal.
      if v_acc.available_balance < v_tx.amount then raise exception 'Client available balance is too low for this withdrawal'; end if;
      update public.accounts set account_balance = greatest(account_balance - v_tx.amount, 0), available_balance = available_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
    end if;
    v_status := 'completed';
  else
    v_status := 'rejected';
  end if;
  update public.transactions set status = v_status, updated_at = now(),
         notes = concat_ws(' | ', notes, initcap(p_action) || 'd' || coalesce(': ' || nullif(trim(p_reason), ''), '')) where id = p_tx_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_tx.user_id, v_tx.type || '_' || p_action || 'd', 'transaction', p_tx_id::text,
          jsonb_build_object('transaction_id', p_tx_id, 'type', v_tx.type, 'amount', v_tx.amount, 'source', v_tx.method, 'client_id', v_tx.user_id, 'reason', nullif(trim(p_reason), '')));
  return v_status;
end $$;

-- 2. Manual balance adjustment: whichever component field an admin corrects,
--    move the legacy total by the same delta so it keeps matching the sum of
--    parts. Adjusting account_balance directly still works exactly as before
--    (no double-adjustment, since the field itself is account_balance).
create or replace function public.admin_adjust_balance(p_user_id uuid, p_field text, p_operation text, p_amount numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_old numeric; v_new numeric; v_total_old numeric; v_total_new numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_field not in ('account_balance', 'available_balance', 'invested_balance', 'pending_balance', 'profit_balance') then raise exception 'Unknown balance field'; end if;
  if p_operation not in ('credit', 'debit', 'set') then raise exception 'Unknown operation'; end if;
  if p_amount is null or p_amount < 0 or (p_amount = 0 and p_operation <> 'set') then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  select account_balance into v_total_old from public.accounts where user_id = p_user_id for update;
  if v_total_old is null then raise exception 'Account not found'; end if;
  execute format('select %I from public.accounts where user_id = $1', p_field) into v_old using p_user_id;
  v_new := round(case p_operation when 'credit' then v_old + p_amount when 'debit' then v_old - p_amount else p_amount end, 2);
  if v_new < 0 then raise exception 'Resulting balance cannot be negative'; end if;

  if p_field = 'account_balance' then
    v_total_new := v_new;
    update public.accounts set account_balance = v_new, updated_at = now() where user_id = p_user_id;
  else
    -- Keep the legacy total equal to the sum of its parts: move it by the
    -- same amount the adjusted component just moved (floored at zero, as
    -- every other balance-moving function already does).
    v_total_new := greatest(v_total_old + (v_new - v_old), 0);
    execute format('update public.accounts set %I = $1, account_balance = $2, updated_at = now() where user_id = $3', p_field)
      using v_new, v_total_new, p_user_id;
  end if;

  if v_new <> v_old then
    insert into public.transactions (user_id, type, method, amount, status, reference, notes)
    values (p_user_id, 'adjustment', p_field, abs(v_new - v_old), 'completed',
            'ADJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), trim(p_reason));
  end if;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_balance_adjustment', 'account', p_user_id::text,
          jsonb_build_object('admin_id', v_admin, 'target_user_id', p_user_id, 'field', p_field, 'operation', p_operation,
                             'amount', p_amount, 'previous_value', v_old, 'new_value', v_new,
                             'previous_account_balance', v_total_old, 'new_account_balance', v_total_new, 'reason', trim(p_reason)));
  return v_new;
end $$;

-- 3. One-time, fully audited correction for accounts the two bugs above have
--    already thrown out of sync. This does not touch available_balance,
--    invested_balance, pending_balance or profit_balance (the balances that
--    actually fund withdrawals and investments): it only brings the legacy
--    account_balance total back in line with the sum of those authoritative
--    parts, and it records every previous value, new value, difference and
--    reason in audit_logs before changing anything - nothing is silently
--    overwritten.
do $$
declare v_row record; v_sum numeric;
begin
  for v_row in
    select user_id, account_balance, available_balance, invested_balance, pending_balance, profit_balance
    from public.accounts
    where account_balance <> (available_balance + invested_balance + pending_balance + profit_balance)
  loop
    v_sum := greatest(v_row.available_balance + v_row.invested_balance + v_row.pending_balance + v_row.profit_balance, 0);
    insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
    values (null, null, v_row.user_id, 'reconciliation_total_corrected', 'account', v_row.user_id::text,
            jsonb_build_object('previous_account_balance', v_row.account_balance, 'new_account_balance', v_sum,
                               'difference', v_sum - v_row.account_balance,
                               'available_balance', v_row.available_balance, 'invested_balance', v_row.invested_balance,
                               'pending_balance', v_row.pending_balance, 'profit_balance', v_row.profit_balance,
                               'reason', 'Migration 202610210001: admin_review_transaction / admin_adjust_balance previously left the legacy account_balance total out of sync with its components; corrected to the sum of available_balance + invested_balance + pending_balance + profit_balance.'));
    update public.accounts set account_balance = v_sum, updated_at = now() where user_id = v_row.user_id;
  end loop;
end $$;

notify pgrst, 'reload schema';

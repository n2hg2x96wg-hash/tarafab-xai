-- Validate against the balances that actually fund an action, not the legacy
-- account_balance column. No data is changed; only three functions.
--
-- Background. account_balance is the older "total" column. Admin adjustments
-- to available_balance / invested_balance / pending_balance / profit_balance
-- never updated it, so for many accounts it no longer matches the balances
-- clients actually use (for example available 31,266.00 with account_balance
-- 0.00). Several functions still compared amounts to it and refused valid
-- requests ("Account balance is lower than the entry fee").
--
-- Rules after this change (accounting itself is unchanged):
--   * Investment approval: the client's funds were already moved from
--     available_balance into pending_balance (the hold) when the request was
--     submitted. Approval spends that hold: pending -= amount, invested +=
--     amount - fee. The entry fee is paid out of the held amount, so it is
--     validated against the hold (pending_balance >= amount, fee <= amount),
--     never against available_balance (which would be double-counting the
--     hold) and never against the legacy total.
--   * The legacy account_balance still moves by the same amount (floored at
--     zero, as admin_withdrawal_transition already does) so nothing errors on
--     its check (>= 0). The before/after values are written to the audit log,
--     and admin_reconciliation() continues to report any total that disagrees
--     with the balances.
--   * Withdrawal approval (legacy review path): checks available_balance only.
--   * Profit reduction: checks profit_balance only.

create or replace function public.admin_review_investment(p_investment_id uuid, p_action text, p_reason text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_inv public.client_investments; v_ver public.investment_product_versions; v_acc public.accounts;
  v_principal numeric; v_status text; v_tx uuid; v_total_after numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Action must be approve or reject'; end if;
  if p_action = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reject'; end if;

  -- Re-read the current state under a lock: a second admin, a retry or a stale
  -- screen cannot approve the same request twice.
  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status <> 'pending_activation' then raise exception 'This investment was already %', v_inv.status; end if;
  select * into v_ver from public.investment_product_versions where id = v_inv.product_version_id;
  select * into v_acc from public.accounts where id = v_inv.account_id for update;

  -- The request amount must still be held. This is the genuine funding check.
  if v_acc.pending_balance < v_inv.principal then
    raise exception 'The held amount is no longer in the client''s pending balance; check recent adjustments';
  end if;

  if p_action = 'approve' then
    if v_inv.fee_amount > v_inv.principal then raise exception 'The entry fee cannot exceed the investment amount'; end if;
    v_principal := v_inv.principal - v_inv.fee_amount;
    v_total_after := greatest(v_acc.account_balance - v_inv.fee_amount, 0);
    update public.accounts set pending_balance = pending_balance - v_inv.principal,
           invested_balance = invested_balance + v_principal,
           account_balance = v_total_after, updated_at = now()
     where id = v_acc.id;
    update public.client_investments set status = 'active', principal = v_principal, start_date = now(),
           maturity_date = now() + public._duration_interval(v_ver.duration_value, v_ver.duration_unit, v_ver.term_days),
           reviewed_by = v_admin, reviewed_at = now(), updated_at = now() where id = v_inv.id;
    update public.transactions t set status = 'completed', updated_at = now()
      from public.investment_transactions it
     where it.transaction_id = t.id and it.client_investment_id = v_inv.id and it.kind = 'principal_in';
    if v_inv.fee_amount > 0 then
      insert into public.transactions (user_id, type, method, amount, direction, status, reference, notes)
      values (v_inv.user_id, 'fee', 'account_balance', v_inv.fee_amount, 'debit', 'completed', v_inv.reference || '-FEE', 'Entry fee: ' || v_ver.name)
      returning id into v_tx;
      insert into public.investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'fee');
    end if;
    v_status := 'active';
  else
    update public.accounts set pending_balance = pending_balance - v_inv.principal,
           available_balance = available_balance + v_inv.principal, updated_at = now()
     where id = v_acc.id;
    update public.client_investments set status = 'rejected', rejection_reason = trim(p_reason), reviewed_by = v_admin,
           reviewed_at = now(), updated_at = now() where id = v_inv.id;
    update public.transactions t set status = 'rejected', updated_at = now(), notes = coalesce(t.notes, '') || ' | Rejected: ' || trim(p_reason)
      from public.investment_transactions it
     where it.transaction_id = t.id and it.client_investment_id = v_inv.id and it.kind = 'principal_in';
    v_status := 'rejected';
  end if;

  perform public._inv_event(v_inv.id, 'pending_activation', v_status, v_admin, p_reason);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_' || case when v_status = 'active' then 'approved' else 'rejected' end,
          'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'amount', v_inv.principal, 'fee', v_inv.fee_amount,
                             'from', 'pending_activation', 'to', v_status, 'reason', nullif(trim(p_reason), ''),
                             'held_before', v_acc.pending_balance, 'invested_before', v_acc.invested_balance,
                             'legacy_total_before', v_acc.account_balance, 'legacy_total_after', case when v_status = 'active' then v_total_after else v_acc.account_balance end));
  return v_status;
end $$;

create or replace function public.admin_set_investment_profit(
  p_investment_id uuid, p_new_profit numeric, p_reason text, p_idempotency_key text
) returns public.investment_profit_adjustments
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_inv client_investments%rowtype;
  v_acct accounts%rowtype;
  v_adj investment_profit_adjustments%rowtype;
  v_delta numeric; v_tx uuid;
begin
  perform public._require_admin();
  if v_key is null then raise exception 'Invalid request'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  if p_new_profit is null or p_new_profit <> round(p_new_profit, 2) then raise exception 'Enter an amount with at most 2 decimal places'; end if;

  select * into v_inv from client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;

  select * into v_adj from investment_profit_adjustments where investment_id = v_inv.id and idempotency_key = v_key;
  if found then return v_adj; end if;

  if v_inv.status not in ('active', 'completed', 'matured') then
    raise exception 'Profit can only be set on an active or completed investment';
  end if;
  if p_new_profit < -v_inv.principal then raise exception 'A loss cannot exceed the principal'; end if;
  v_delta := p_new_profit - v_inv.profit_amount;
  if v_delta = 0 then raise exception 'The new profit is the same as the current profit'; end if;

  select * into v_acct from accounts where user_id = v_inv.user_id for update;
  if not found then raise exception 'Account not found'; end if;
  -- Only the profit balance has to cover a reduction (the legacy total may lag).
  if v_acct.profit_balance + v_delta < 0 then
    raise exception 'The client''s profit balance cannot cover this reduction';
  end if;

  update accounts set profit_balance = profit_balance + v_delta,
         account_balance = greatest(account_balance + v_delta, 0), updated_at = now()
   where user_id = v_inv.user_id;
  update client_investments set profit_amount = p_new_profit, updated_at = now() where id = v_inv.id;

  insert into transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key)
  values (v_inv.user_id, 'return', 'profit_balance', abs(v_delta), case when v_delta > 0 then 'credit' else 'debit' end, 'completed',
          coalesce(v_inv.reference, 'INV') || '-R' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          trim(p_reason), 'inv-profit:' || v_inv.id || ':' || v_key)
  returning id into v_tx;
  insert into investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'return');

  insert into investment_profit_adjustments (investment_id, client_id, admin_id, previous_profit, new_profit, previous_value, new_value, reason, transaction_id, idempotency_key)
  values (v_inv.id, v_inv.user_id, v_admin, v_inv.profit_amount, p_new_profit,
          v_inv.principal + v_inv.profit_amount, v_inv.principal + p_new_profit, trim(p_reason), v_tx, v_key)
  returning * into v_adj;

  perform public._inv_event(v_inv.id, v_inv.status, v_inv.status, v_admin,
    'Profit / return set from ' || to_char(v_inv.profit_amount, 'FM999999990.00') || ' to ' || to_char(p_new_profit, 'FM999999990.00'));

  insert into audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_profit_adjusted', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'adjustment_id', v_adj.id, 'transaction_id', v_tx,
                             'previous_profit', v_adj.previous_profit, 'new_profit', v_adj.new_profit,
                             'previous_value', v_adj.previous_value, 'new_value', v_adj.new_value,
                             'previous_profit_balance', v_acct.profit_balance, 'new_profit_balance', v_acct.profit_balance + v_delta,
                             'reason', trim(p_reason)));
  return v_adj;
end $$;

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
      update public.accounts set profit_balance = profit_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
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

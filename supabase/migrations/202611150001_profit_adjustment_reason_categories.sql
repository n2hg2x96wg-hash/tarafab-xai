-- Profit-balance adjustments by documented reason (additive, non-destructive).
--
-- Root cause: "Adjust profit balance" (admin_adjust_balance on profit_balance)
-- stores only a free-text reason, so every such row has source
-- 'profit_adjustment' and the client saw "Profit adjustment" whatever the
-- admin meant — a loyalty reward, a correction, a reconciliation. Free text is
-- not a reliable classification, so the meaning is now an explicit category,
-- chosen by the admin and stored in `source`:
--
--   loyalty_reward      → Loyalty Reward        (credit only)
--   promotional_credit  → Promotional Credit    (credit only)
--   profit_correction   → Profit Balance Correction
--   reconciliation      → Account Reconciliation
--   profit_adjustment   → Profit Balance Adjustment (other / not stated; the
--                         existing value, kept for every historical row)
--
-- None of these is an investment return (that stays 'investment_profit').
--
--   * admin_adjust_profit_balance: the existing admin_adjust_balance(_effective)
--     does the balance change (same lock, idempotency, stale-page check,
--     effective date and audit); this wrapper then records the category on the
--     one row that call inserted, and audits it.
--   * admin_set_profit_adjustment_category: an admin states the documented
--     reason of ONE existing profit-balance adjustment. Only `source` changes
--     (old and new value audited); amount, dates, reference, status and
--     balances are untouched. Nothing is reclassified automatically.

do $$ begin
  alter table public.transactions drop constraint if exists transactions_source_check;
  alter table public.transactions add constraint transactions_source_check check (source is null or source in (
    'client_deposit', 'admin_funding', 'admin_debit', 'profit_adjustment', 'balance_adjustment',
    'investment_principal', 'investment_profit', 'withdrawal', 'fee', 'transfer', 'reversal',
    'loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation'
  ));
end $$;

-- category code → stored source ('other' = the existing profit_adjustment)
create or replace function public._profit_adjustment_source(p_category text)
returns text language sql immutable as $$
  select case p_category
    when 'loyalty_reward' then 'loyalty_reward'
    when 'promotional_credit' then 'promotional_credit'
    when 'profit_correction' then 'profit_correction'
    when 'reconciliation' then 'reconciliation'
    when 'other' then 'profit_adjustment'
    else null end
$$;

create or replace function public.admin_adjust_profit_balance(
  p_user_id uuid, p_operation text, p_amount numeric, p_reason text, p_category text,
  p_idempotency_key text default null, p_expected_updated_at timestamptz default null, p_effective_at timestamptz default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_src text := public._profit_adjustment_source(p_category); v numeric; v_tx uuid; v_dir text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if v_src is null then raise exception 'Choose a reason for this adjustment'; end if;
  if v_src in ('loyalty_reward', 'promotional_credit') and p_operation <> 'credit' then
    raise exception 'A reward or promotional credit must be a credit';
  end if;

  if p_effective_at is null then
    v := public.admin_adjust_balance(p_user_id, 'profit_balance', p_operation, p_amount, p_reason, p_idempotency_key, p_expected_updated_at);
  else
    v := public.admin_adjust_balance_effective(p_user_id, 'profit_balance', p_operation, p_amount, p_reason, p_idempotency_key, p_expected_updated_at, p_effective_at);
  end if;

  -- The row the call above inserted in this transaction (none on an
  -- idempotent retry or a "set" to the same value).
  select id, direction into v_tx, v_dir from public.transactions
   where user_id = p_user_id and type = 'adjustment' and method = 'profit_balance'
     and source = 'profit_adjustment' and created_at = now()
   order by id limit 1;
  if v_tx is not null then
    if v_src in ('loyalty_reward', 'promotional_credit') and v_dir <> 'credit' then
      raise exception 'A reward or promotional credit must increase the balance';
    end if;
    update public.transactions set source = v_src where id = v_tx;
    perform public._audit('PROFIT_ADJUSTMENT_CATEGORY_SET', p_user_id, 'transaction', v_tx::text,
      jsonb_build_object('category', p_category, 'source', v_src, 'previous_source', 'profit_adjustment', 'reason', left(trim(p_reason), 500), 'at_creation', true));
  end if;
  return v;
end $$;

create or replace function public.admin_set_profit_adjustment_category(p_tx uuid, p_category text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.transactions%rowtype; v_src text := public._profit_adjustment_source(p_category);
begin
  perform public._require_admin();
  if v_src is null then raise exception 'Choose a reason for this adjustment'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter why you are setting this reason.'; end if;
  select * into t from public.transactions where id = p_tx for update;
  if not found then raise exception 'Transaction not found.'; end if;
  if t.type <> 'adjustment' or t.method <> 'profit_balance'
     or t.source not in ('profit_adjustment', 'loyalty_reward', 'promotional_credit', 'profit_correction', 'reconciliation') then
    raise exception 'Only a profit-balance adjustment can be given a reason.';
  end if;
  if v_src in ('loyalty_reward', 'promotional_credit') and t.direction is distinct from 'credit' then
    raise exception 'A reward or promotional credit must be a credit';
  end if;
  if t.source = v_src then
    return jsonb_build_object('transaction_id', t.id, 'source', t.source, 'changed', false);
  end if;
  update public.transactions set source = v_src where id = t.id;
  perform public._audit('PROFIT_ADJUSTMENT_CATEGORY_SET', t.user_id, 'transaction', t.id::text, jsonb_build_object(
    'reference', t.reference, 'amount', t.amount, 'direction', t.direction, 'category', p_category,
    'previous_source', t.source, 'source', v_src, 'reason', left(trim(p_reason), 500), 'at_creation', false));
  return jsonb_build_object('transaction_id', t.id, 'source', v_src, 'changed', true);
end $$;

revoke all on function public.admin_adjust_profit_balance(uuid, text, numeric, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_adjust_profit_balance(uuid, text, numeric, text, text, text, timestamptz, timestamptz) to authenticated;
revoke all on function public.admin_set_profit_adjustment_category(uuid, text, text) from public, anon;
grant execute on function public.admin_set_profit_adjustment_category(uuid, text, text) to authenticated;

-- Per-investment profit / return. Additive; existing rows get 0 (no return
-- recorded), which is what they have today.
--
-- client_investments.profit_amount is the authoritative profit of ONE
-- investment. It only changes through admin_set_investment_profit(), which in
-- the same database transaction:
--   * moves the client's profit_balance and account_balance by the difference
--     (so the account total keeps matching its parts),
--   * writes a ledger row linked to the investment,
--   * appends an immutable row to investment_profit_adjustments,
--   * appends a timeline event and an audit entry.
-- Current value = principal + profit_amount. Nothing is ever generated.

alter table public.client_investments
  add column if not exists profit_amount numeric(14,2) not null default 0;

-- Returns already recorded through the ledger (if any) are carried over, so
-- the new column agrees with history.
update public.client_investments ci
   set profit_amount = s.total
  from (
    select it.client_investment_id, sum(case when t.direction = 'debit' then -t.amount else t.amount end) as total
      from public.investment_transactions it join public.transactions t on t.id = it.transaction_id
     where it.kind = 'return' and t.status = 'completed'
     group by it.client_investment_id
  ) s
 where s.client_investment_id = ci.id and ci.profit_amount = 0 and s.total <> 0;

create table if not exists public.investment_profit_adjustments (
  id               uuid primary key default gen_random_uuid(),
  investment_id    uuid not null references public.client_investments(id) on delete restrict,
  client_id        uuid not null references auth.users(id),
  admin_id         uuid not null references auth.users(id),
  previous_profit  numeric(14,2) not null,
  new_profit       numeric(14,2) not null,
  previous_value   numeric(14,2) not null,
  new_value        numeric(14,2) not null,
  reason           text not null check (length(trim(reason)) between 3 and 500),
  transaction_id   uuid references public.transactions(id),
  idempotency_key  text not null,
  created_at       timestamptz not null default now(),
  unique (investment_id, idempotency_key)
);
create index if not exists investment_profit_adjustments_inv_idx on public.investment_profit_adjustments (investment_id, created_at desc);
create index if not exists investment_profit_adjustments_client_idx on public.investment_profit_adjustments (client_id, created_at desc);
create index if not exists investment_profit_adjustments_created_idx on public.investment_profit_adjustments (created_at desc);

-- History cannot be edited or deleted, even by the table owner's API roles.
drop trigger if exists investment_profit_adjustments_append_only on public.investment_profit_adjustments;
create trigger investment_profit_adjustments_append_only
  before update or delete on public.investment_profit_adjustments
  for each row execute function public._append_only();

alter table public.investment_profit_adjustments enable row level security;
drop policy if exists investment_profit_adjustments_select on public.investment_profit_adjustments;
create policy investment_profit_adjustments_select on public.investment_profit_adjustments
  for select using (client_id = (select auth.uid()) or public.is_admin());
revoke all on public.investment_profit_adjustments from anon, authenticated;
grant select on public.investment_profit_adjustments to authenticated;

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

  -- Lock the investment first, then the account: every writer uses this order.
  select * into v_inv from client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;

  -- The same request again returns the adjustment it already made.
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
  if v_acct.profit_balance + v_delta < 0 or v_acct.account_balance + v_delta < 0 then
    raise exception 'The client''s profit balance cannot cover this reduction';
  end if;

  update accounts set profit_balance = profit_balance + v_delta, account_balance = account_balance + v_delta, updated_at = now()
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
revoke all on function public.admin_set_investment_profit(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_set_investment_profit(uuid, numeric, text, text) to authenticated;

-- The earlier "record return" action now goes through the same path, so the
-- per-investment profit, history and ledger can never disagree.
create or replace function public.admin_record_investment_return(
  p_investment_id uuid, p_amount numeric, p_reason text, p_idempotency_key text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_cur numeric; v_adj investment_profit_adjustments%rowtype;
begin
  perform public._require_admin();
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  select profit_amount into v_cur from client_investments where id = p_investment_id;
  if not found then raise exception 'Investment not found'; end if;
  -- A retry with the same key returns the original adjustment unchanged.
  select * into v_adj from investment_profit_adjustments where investment_id = p_investment_id and idempotency_key = p_idempotency_key;
  if found then return v_adj.new_profit; end if;
  v_adj := public.admin_set_investment_profit(p_investment_id, v_cur + p_amount, p_reason, p_idempotency_key);
  return v_adj.new_profit;
end $$;
revoke all on function public.admin_record_investment_return(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_record_investment_return(uuid, numeric, text, text) to authenticated;

-- Reconciliation also checks each investment's profit against its ledger rows.
create or replace function public.admin_reconciliation()
returns table (user_id uuid, full_name text, check_name text, expected numeric, actual numeric, difference numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  with a as (
    select ac.user_id, p.full_name, ac.account_balance, ac.available_balance, ac.invested_balance, ac.pending_balance, ac.profit_balance
    from accounts ac left join profiles p on p.id = ac.user_id
  ), holds as (
    select ci.user_id,
           coalesce(sum(ci.principal) filter (where ci.status = 'pending_activation'), 0) as pending_inv,
           coalesce(sum(ci.principal) filter (where ci.status = 'active'), 0) as active_inv
    from client_investments ci group by ci.user_id
  ), inv_ledger as (
    select ci.id, ci.user_id, ci.profit_amount,
           coalesce(sum(case when t.direction = 'debit' then -t.amount else t.amount end) filter (where it.kind = 'return' and t.status = 'completed'), 0) as ledger
    from client_investments ci
    left join investment_transactions it on it.client_investment_id = ci.id
    left join transactions t on t.id = it.transaction_id
    group by ci.id, ci.user_id, ci.profit_amount
  )
  select a.user_id, a.full_name, 'total_vs_parts'::text,
         (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance), a.account_balance,
         a.account_balance - (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  from a where a.account_balance <> (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  union all
  select a.user_id, a.full_name, 'negative_balance', 0::numeric,
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance),
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance)
  from a where least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance) < 0
  union all
  select a.user_id, a.full_name, 'pending_investments_not_held', h.pending_inv, a.pending_balance, a.pending_balance - h.pending_inv
  from a join holds h on h.user_id = a.user_id where a.pending_balance < h.pending_inv
  union all
  select a.user_id, a.full_name, 'active_investments_not_invested', h.active_inv, a.invested_balance, a.invested_balance - h.active_inv
  from a join holds h on h.user_id = a.user_id where a.invested_balance < h.active_inv
  union all
  select l.user_id, p.full_name, 'investment_profit_vs_ledger', l.ledger, l.profit_amount, l.profit_amount - l.ledger
  from inv_ledger l left join profiles p on p.id = l.user_id where l.profit_amount <> l.ledger;
end $$;

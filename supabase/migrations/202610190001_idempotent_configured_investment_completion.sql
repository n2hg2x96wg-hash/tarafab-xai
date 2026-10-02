-- Complete investments atomically and credit only a return defined by the
-- immutable product version linked to that investment. Existing rows and
-- historical ledger entries are left untouched.

create or replace function public.admin_complete_investment(p_investment_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_inv public.client_investments;
  v_version public.investment_product_versions;
  v_acc public.accounts;
  v_tx uuid;
  v_completion_key text;
  v_configured_profit numeric;
  v_ledger_profit numeric;
  v_unknown_ledger_direction boolean;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status = 'completed' then return 'completed'; end if;
  if v_inv.status <> 'active' then raise exception 'Only an active investment can be completed'; end if;
  if v_inv.maturity_date is not null and v_inv.maturity_date > now() then
    raise exception 'This investment is not eligible for completion until its maturity date';
  end if;

  select * into v_acc from public.accounts where id = v_inv.account_id for update;
  if not found then raise exception 'Account not found'; end if;
  if v_acc.invested_balance < v_inv.principal then
    raise exception 'The client''s invested balance is lower than this principal; check recent adjustments';
  end if;

  select * into v_version from public.investment_product_versions where id = v_inv.product_version_id;
  if found then
    v_configured_profit := case v_version.return_type
      when 'fixed_rate' then case when v_version.return_rate_pct is not null
        then round(v_inv.principal * v_version.return_rate_pct / 100, 2) end
      when 'fixed_amount' then v_version.return_amount
      else null
    end;
  end if;

  select coalesce(sum(case when t.direction = 'debit' then -t.amount else t.amount end), 0)
    into v_ledger_profit
    from public.investment_transactions it
    join public.transactions t on t.id = it.transaction_id
   where it.client_investment_id = v_inv.id
     and it.kind = 'return'
     and t.status in ('completed', 'approved')
     and t.direction in ('credit', 'debit');
  select exists (
    select 1
      from public.investment_transactions it
      join public.transactions t on t.id = it.transaction_id
     where it.client_investment_id = v_inv.id
       and it.kind = 'return'
       and t.status in ('completed', 'approved')
       and t.direction is null
  ) into v_unknown_ledger_direction;

  v_completion_key := 'inv-complete-' || replace(v_inv.id::text, '-', '');
  update public.accounts
     set invested_balance = invested_balance - v_inv.principal,
         available_balance = available_balance + v_inv.principal,
         updated_at = now()
   where id = v_acc.id;
  update public.client_investments
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = v_inv.id;

  insert into public.transactions
    (user_id, type, method, amount, status, reference, notes, idempotency_key)
  values
    (v_inv.user_id, 'investment', 'invested_balance', v_inv.principal, 'completed',
     v_inv.reference || '-END', 'Principal returned to available balance',
     v_completion_key)
  returning id into v_tx;
  insert into public.investment_transactions (client_investment_id, transaction_id, kind)
  values (v_inv.id, v_tx, 'principal_out');

  perform public._inv_event(v_inv.id, 'active', 'completed', v_admin, p_reason);

  -- Post a configured return once, only when no profit has already been
  -- recorded. A previously credited amount is never silently replaced.
  if v_configured_profit is not null and v_configured_profit > 0
     and v_inv.profit_amount = 0 and v_ledger_profit = 0 and not v_unknown_ledger_direction then
    perform public.admin_set_investment_profit(
      v_inv.id,
      v_configured_profit,
      'Configured product version return on completion',
      'inv-completion-profit-' || replace(v_inv.id::text, '-', '')
    );
  end if;

  insert into public.audit_logs
    (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values
    (v_admin, v_admin, v_inv.user_id, 'investment_completed', 'client_investment', v_inv.id::text,
     jsonb_build_object(
       'reference', v_inv.reference,
       'principal', v_inv.principal,
       'product_version_id', v_inv.product_version_id,
       'configured_profit', v_configured_profit,
       'profit_before_completion', v_inv.profit_amount,
       'profit_ledger_before_completion', v_ledger_profit,
       'profit_ledger_direction_missing', v_unknown_ledger_direction,
       'profit_posted', v_configured_profit is not null and v_configured_profit > 0
         and v_inv.profit_amount = 0 and v_ledger_profit = 0 and not v_unknown_ledger_direction,
       'reason', trim(p_reason)
     ));
  return 'completed';
end
$$;

revoke all on function public.admin_complete_investment(uuid, text) from public, anon;
grant execute on function public.admin_complete_investment(uuid, text) to authenticated;

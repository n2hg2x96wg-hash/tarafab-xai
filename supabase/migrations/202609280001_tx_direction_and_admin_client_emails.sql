-- Applied to project jdskpqjwmaeurxspipyv as
-- "tx_direction_and_admin_client_emails".

-- 1. Record whether an adjustment increased or decreased a balance, so the
--    client UI can label a credit as "Profit"/"Return" without mislabelling
--    a deduction. Additive and nullable; no existing logic depends on it.
alter table public.transactions
  add column if not exists direction text
  constraint transactions_direction_check check (direction in ('credit', 'debit'));

-- 2. Backfill existing adjustments from the audit log (matched on client +
--    balance field + same-instant timestamp). Direction is derived from the
--    recorded before/after values, never guessed.
update public.transactions t
set direction = case
      when (a.details->>'new_value')::numeric > (a.details->>'previous_value')::numeric then 'credit'
      else 'debit'
    end
from public.audit_logs a
where t.type = 'adjustment'
  and t.direction is null
  and a.action = 'admin_balance_adjustment'
  and a.target_user_id = t.user_id
  and a.details->>'field' = t.method
  and abs(extract(epoch from (a.created_at - t.created_at))) < 5;

-- 3. Same function as before, with the direction recorded on the row.
create or replace function public.admin_adjust_balance(p_user_id uuid, p_field text, p_operation text, p_amount numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $function$
declare v_admin uuid := auth.uid(); v_old numeric; v_new numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_field not in ('account_balance', 'available_balance', 'invested_balance', 'pending_balance', 'profit_balance') then raise exception 'Unknown balance field'; end if;
  if p_operation not in ('credit', 'debit', 'set') then raise exception 'Unknown operation'; end if;
  if p_amount is null or p_amount < 0 or (p_amount = 0 and p_operation <> 'set') then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  execute format('select %I from public.accounts where user_id = $1 for update', p_field) into v_old using p_user_id;
  if v_old is null then raise exception 'Account not found'; end if;
  v_new := round(case p_operation when 'credit' then v_old + p_amount when 'debit' then v_old - p_amount else p_amount end, 2);
  if v_new < 0 then raise exception 'Resulting balance cannot be negative'; end if;
  execute format('update public.accounts set %I = $1, updated_at = now() where user_id = $2', p_field) using v_new, p_user_id;

  if v_new <> v_old then
    insert into public.transactions (user_id, type, method, amount, status, reference, notes, direction)
    values (p_user_id, 'adjustment', p_field, abs(v_new - v_old), 'completed',
            'ADJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), trim(p_reason),
            case when v_new > v_old then 'credit' else 'debit' end);
  end if;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_balance_adjustment', 'account', p_user_id::text,
          jsonb_build_object('admin_id', v_admin, 'target_user_id', p_user_id, 'field', p_field, 'operation', p_operation,
                             'amount', p_amount, 'previous_value', v_old, 'new_value', v_new, 'reason', trim(p_reason)));
  return v_new;
end $function$;

-- 4. Admin-only lookup of the registration email held in auth.users.
--    No email is duplicated into public tables; this reads the existing
--    authentication record and is refused for anyone who is not an admin.
create or replace function public.admin_client_emails()
returns table (id uuid, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select u.id, u.email::text
    from auth.users u
    where exists (select 1 from public.profiles p where p.id = u.id);
end $$;

revoke all on function public.admin_client_emails() from public, anon;
grant execute on function public.admin_client_emails() to authenticated;

notify pgrst, 'reload schema';

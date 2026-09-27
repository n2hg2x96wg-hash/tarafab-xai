-- Applied to project jdskpqjwmaeurxspipyv on 2026-09-27 as
-- "profiles_links_profit_balance_withdrawals_admin_rpcs".

-- 1. Let the API join profiles <-> accounts / transactions (admin pages rely on this)
alter table public.accounts
  add constraint accounts_user_id_profiles_fkey foreign key (user_id) references public.profiles(id);
alter table public.transactions
  add constraint transactions_user_id_profiles_fkey foreign key (user_id) references public.profiles(id);

-- 2. Profit balance, editable by admin only
alter table public.accounts
  add column if not exists profit_balance numeric not null default 0
  constraint accounts_profit_balance_check check (profit_balance >= 0);

-- 3. Client: submit a deposit for review (never touches balances)
create or replace function public.client_submit_deposit(p_amount numeric, p_method text, p_receipt_path text default null, p_notes text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_tx public.transactions;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(trim(p_method), '') = '' then raise exception 'Payment method is required'; end if;
  insert into public.transactions (user_id, type, method, amount, status, reference, notes)
  values (v_uid, 'deposit', trim(p_method), round(p_amount, 2), 'pending_review',
          'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          nullif(concat_ws(' | ', nullif(trim(p_notes), ''), case when p_receipt_path is not null then 'receipt:' || p_receipt_path end), ''))
  returning * into v_tx;
  return v_tx;
end $$;

-- 4. Client: request a withdrawal from available or profit balance
create or replace function public.client_request_withdrawal(p_amount numeric, p_source text, p_address text, p_notes text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_acc public.accounts; v_pending numeric; v_balance numeric; v_tx public.transactions;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_source not in ('available_balance', 'profit_balance') then raise exception 'Choose which balance to withdraw from'; end if;
  if coalesce(trim(p_address), '') !~ '^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$' then raise exception 'Enter a valid Bitcoin address'; end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then raise exception 'Your account is suspended. Contact support.'; end if;

  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  v_balance := case when p_source = 'profit_balance' then v_acc.profit_balance else v_acc.available_balance end;
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = v_uid and type = 'withdrawal' and method = p_source and status in ('pending_review', 'pending', 'requested', 'under_review');
  if round(p_amount, 2) > v_balance - v_pending then
    raise exception 'Amount is more than you can withdraw. Available: %', to_char(greatest(v_balance - v_pending, 0), 'FM999,999,999,990.00');
  end if;

  insert into public.transactions (user_id, type, method, amount, status, reference, address, network, notes)
  values (v_uid, 'withdrawal', p_source, round(p_amount, 2), 'pending_review',
          'WDR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          trim(p_address), 'bitcoin', nullif(trim(p_notes), ''))
  returning * into v_tx;
  return v_tx;
end $$;

-- 5. Admin: approve / reject a pending deposit or withdrawal atomically
create or replace function public.admin_review_transaction(p_tx_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
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
      update public.accounts set account_balance = account_balance + v_tx.amount,
        available_balance = available_balance + v_tx.amount, updated_at = now() where id = v_acc.id;
    elsif v_tx.method = 'profit_balance' then
      if v_acc.profit_balance < v_tx.amount then raise exception 'Client profit balance is too low for this withdrawal'; end if;
      update public.accounts set profit_balance = profit_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
    else
      if v_acc.available_balance < v_tx.amount or v_acc.account_balance < v_tx.amount then
        raise exception 'Client available balance is too low for this withdrawal';
      end if;
      update public.accounts set account_balance = account_balance - v_tx.amount,
        available_balance = available_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
    end if;
    v_status := 'completed';
  else
    v_status := 'rejected';
  end if;

  update public.transactions set status = v_status, updated_at = now(),
    notes = concat_ws(' | ', notes, initcap(p_action) || 'd' || coalesce(': ' || nullif(trim(p_reason), ''), ''))
  where id = p_tx_id;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_tx.user_id, v_tx.type || '_' || p_action || 'd', 'transaction', p_tx_id::text,
          jsonb_build_object('transaction_id', p_tx_id, 'type', v_tx.type, 'amount', v_tx.amount,
                             'source', v_tx.method, 'client_id', v_tx.user_id, 'reason', nullif(trim(p_reason), '')));
  return v_status;
end $$;

-- 6. Admin: change one balance field atomically, with a record and an audit entry
create or replace function public.admin_adjust_balance(p_user_id uuid, p_field text, p_operation text, p_amount numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
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
    insert into public.transactions (user_id, type, method, amount, status, reference, notes)
    values (p_user_id, 'adjustment', p_field, abs(v_new - v_old), 'completed',
            'ADJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), trim(p_reason));
  end if;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_balance_adjustment', 'account', p_user_id::text,
          jsonb_build_object('admin_id', v_admin, 'target_user_id', p_user_id, 'field', p_field, 'operation', p_operation,
                             'amount', p_amount, 'previous_value', v_old, 'new_value', v_new, 'reason', trim(p_reason)));
  return v_new;
end $$;

-- 7. Admin: edit client profile details
create or replace function public.admin_update_client(p_user_id uuid, p_full_name text, p_account_status text, p_verification_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_old public.profiles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Client not found'; end if;
  if p_account_status not in ('active', 'suspended') then raise exception 'Invalid account status'; end if;
  if p_verification_status not in ('unverified', 'pending', 'verified', 'rejected') then raise exception 'Invalid verification status'; end if;
  update public.profiles set full_name = coalesce(trim(p_full_name), ''), account_status = p_account_status,
    verification_status = p_verification_status, updated_at = now() where id = p_user_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_client_updated', 'profile', p_user_id::text,
          jsonb_build_object('before', jsonb_build_object('full_name', v_old.full_name, 'account_status', v_old.account_status, 'verification_status', v_old.verification_status),
                             'after', jsonb_build_object('full_name', trim(p_full_name), 'account_status', p_account_status, 'verification_status', p_verification_status)));
end $$;

revoke all on function public.client_submit_deposit(numeric, text, text, text) from public, anon;
revoke all on function public.client_request_withdrawal(numeric, text, text, text) from public, anon;
revoke all on function public.admin_review_transaction(uuid, text, text) from public, anon;
revoke all on function public.admin_adjust_balance(uuid, text, text, numeric, text) from public, anon;
revoke all on function public.admin_update_client(uuid, text, text, text) from public, anon;
grant execute on function public.client_submit_deposit(numeric, text, text, text) to authenticated;
grant execute on function public.client_request_withdrawal(numeric, text, text, text) to authenticated;
grant execute on function public.admin_review_transaction(uuid, text, text) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.admin_update_client(uuid, text, text, text) to authenticated;

-- 8. Private storage for deposit receipts: clients write/read only their own folder, admins read all
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-receipts', 'deposit-receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "receipts_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'deposit-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts_select_own_or_admin" on storage.objects for select to authenticated
  using (bucket_id = 'deposit-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

notify pgrst, 'reload schema';

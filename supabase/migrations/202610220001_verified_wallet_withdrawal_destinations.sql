-- Allow a withdrawal to target one of the caller's already verified wallets.
-- The legacy Bitcoin-address withdrawal RPC remains unchanged.
create function public.client_request_withdrawal_to_wallet(
  p_amount numeric,
  p_source text,
  p_wallet_id uuid,
  p_notes text default null,
  p_idempotency_key text default null
) returns public.transactions
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_wallet public.client_wallets;
  v_acc public.accounts;
  v_pending numeric;
  v_balance numeric;
  v_tx public.transactions;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;

  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_source not in ('available_balance', 'profit_balance') then raise exception 'Choose which balance to withdraw from'; end if;

  select * into v_wallet from public.client_wallets
   where id = p_wallet_id and user_id = v_uid and status = 'linked' and verification_status = 'verified'
   for update;
  if not found then raise exception 'Choose a linked and verified wallet'; end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then
    raise exception 'Your account is suspended. Contact support.';
  end if;

  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;

  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;

  if (select count(*) from public.transactions where user_id = v_uid and type = 'withdrawal'
        and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many withdrawal requests. Please wait a few minutes and try again.';
  end if;

  v_balance := case when p_source = 'profit_balance' then v_acc.profit_balance else v_acc.available_balance end;
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = v_uid and type = 'withdrawal' and method = p_source
     and status in ('pending_review', 'pending', 'requested', 'under_review');
  if round(p_amount, 2) > v_balance - v_pending then
    raise exception 'Amount is more than you can withdraw. Available: %',
      to_char(greatest(v_balance - v_pending, 0), 'FM999,999,999,990.00');
  end if;

  insert into public.transactions (user_id, type, method, amount, status, reference, address, network, notes, idempotency_key)
  values (v_uid, 'withdrawal', p_source, round(p_amount, 2), 'pending_review',
          'WDR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          v_wallet.address, v_wallet.network, nullif(trim(p_notes), ''), v_key)
  returning * into v_tx;
  return v_tx;
end $$;

revoke all on function public.client_request_withdrawal_to_wallet(numeric, text, uuid, text, text) from public, anon;
grant execute on function public.client_request_withdrawal_to_wallet(numeric, text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

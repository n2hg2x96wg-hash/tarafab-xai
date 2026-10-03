-- Ethereum deposits on the Deposit page + network-aware withdrawal fees.
-- Additive only: no existing rows are changed.

-- 1) One mapping from a withdrawal network name to the fee-rule scope
--    (asset, chain id). Used by both the client preview and the charge, so
--    the preview always equals what is charged.
create or replace function public._network_fee_scope(p_network text, out asset text, out chain_id integer)
language sql immutable set search_path = public as $$
  select s.asset, s.chain_id from (values
    ('bitcoin', 'BTC', null::integer), ('btc', 'BTC', null),
    ('ethereum', 'ETH', 1), ('eth', 'ETH', 1),
    ('base', 'ETH', 8453), ('arbitrum', 'ETH', 42161), ('arbitrum one', 'ETH', 42161),
    ('optimism', 'ETH', 10), ('op mainnet', 'ETH', 10),
    ('polygon', 'POL', 137), ('bnb smart chain', 'BNB', 56), ('bsc', 'BNB', 56)
  ) s(name, asset, chain_id)
  where s.name = lower(trim(coalesce(p_network, '')))
$$;

-- Withdrawal quote for a destination network (signed-in clients).
create or replace function public.quote_withdrawal_fee(p_network text, p_amount numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sc record; q record;
begin
  if auth.uid() is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into sc from public._network_fee_scope(p_network);
  select * into q from public._service_fee('withdrawal', sc.asset, sc.chain_id, round(p_amount, 2));
  return jsonb_build_object('fee', q.fee, 'rule_id', q.rule_id, 'label', q.label, 'amount', round(p_amount, 2),
                            'net', greatest(round(p_amount, 2) - q.fee, 0), 'asset', sc.asset, 'chain_id', sc.chain_id);
end $$;
revoke all on function public.quote_withdrawal_fee(text, numeric) from public, anon;
grant execute on function public.quote_withdrawal_fee(text, numeric) to authenticated;

-- The charge uses the same scope as the preview (previously asset 'USD' and
-- no network, so asset/network-specific withdrawal rules never matched).
-- General rules match exactly as before.
create or replace function public._withdrawal_fee_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare q record; sc record;
begin
  if new.type = 'withdrawal' and coalesce(new.fee, 0) = 0 then
    -- transactions.asset defaults to 'USD' (the account currency), so the
    -- destination network decides the rule scope, exactly as in the preview.
    select * into sc from public._network_fee_scope(new.network);
    select * into q from public._service_fee('withdrawal', coalesce(sc.asset, nullif(new.asset, 'USD'), 'USD'), sc.chain_id, new.amount);
    new.fee := coalesce(q.fee, 0);
  end if;
  return new;
end $$;

-- 2) Ethereum deposit (manual send from any wallet/exchange). Uses the
--    admin's existing receiving address (deposit_addresses). Recorded as
--    pending_review exactly like other deposits: nothing is credited until
--    an admin verifies the transaction on-chain and approves it.
create or replace function public.client_submit_eth_deposit(p_amount numeric, p_eth_amount numeric, p_tx_hash text, p_from_address text,
  p_notes text default null, p_idempotency_key text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_tx public.transactions; v_key text := public._check_idempotency_key(p_idempotency_key);
        d public.deposit_addresses; v_hash text := lower(trim(coalesce(p_tx_hash, ''))); v_from text := lower(trim(coalesce(p_from_address, '')));
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;
  select * into d from public.deposit_addresses where enabled and asset = 'ETH' and chain_id = 1 and token_contract is null limit 1;
  if not found then raise exception 'Ethereum deposits are temporarily unavailable.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_eth_amount is null or p_eth_amount <= 0 then raise exception 'Enter the amount of ETH you sent.'; end if;
  if v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'Enter a valid Ethereum transaction hash (0x followed by 64 characters).'; end if;
  if v_from !~ '^0x[0-9a-f]{40}$' then raise exception 'Enter the Ethereum address you sent from (0x followed by 40 characters).'; end if;
  if v_from = d.address then raise exception 'The sender address cannot be the Tarafab receiving address.'; end if;
  -- One claim per transaction, across all clients and both deposit paths.
  if exists (select 1 from public.transactions where lower(tx_hash) = v_hash and type = 'deposit' and status not in ('rejected', 'failed', 'cancelled'))
     or exists (select 1 from public.wallet_transfers where lower(tx_hash) = v_hash) then
    raise exception 'This transaction has already been submitted.';
  end if;
  if (select count(*) from public.transactions where user_id = v_uid and type = 'deposit' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many deposit submissions. Please wait a few minutes and try again.';
  end if;
  begin
    insert into public.transactions (user_id, type, method, amount, status, reference, asset, network, address, tx_hash, notes, idempotency_key)
    values (v_uid, 'deposit', 'ethereum', round(p_amount, 2), 'pending_review',
            'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 'ETH', 'Ethereum', v_from, v_hash,
            concat_ws(' | ', 'ETH sent: ' || trim(to_char(p_eth_amount, 'FM999999990.000000000000000000')),
                      'to ' || d.address, 'verify on-chain: ' || d.min_confirmations || '+ confirmations', nullif(trim(coalesce(p_notes, '')), '')),
            v_key)
    returning * into v_tx;
  exception when unique_violation then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
  end;
  return v_tx;
end $$;
revoke all on function public.client_submit_eth_deposit(numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.client_submit_eth_deposit(numeric, numeric, text, text, text, text) to authenticated;

-- Tarafab.XAi external-wallet deposit flow.
-- Additive only. No existing wallet, transaction, user or balance rows are deleted/reset.

create table if not exists public.wallet_deposit_configs (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  network text not null,
  asset text not null default 'native',
  symbol text not null,
  receiving_address text not null check (receiving_address ~ '^0x[0-9a-f]{40}$'),
  enabled boolean not null default false,
  fee_bps integer not null default 0 check (fee_bps between 0 and 10000),
  fixed_fee numeric(30,18) not null default 0 check (fixed_fee >= 0),
  min_amount numeric(30,18) not null default 0 check (min_amount >= 0),
  max_amount numeric(30,18) check (max_amount is null or max_amount > 0),
  confirmations integer not null default 1 check (confirmations between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chain_id, asset)
);

create table if not exists public.wallet_deposit_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid not null references public.client_wallets(id) on delete restrict,
  chain_id integer not null,
  network text not null,
  asset text not null default 'native',
  symbol text not null,
  from_address text not null check (from_address ~ '^0x[0-9a-f]{40}$'),
  receiving_address text not null check (receiving_address ~ '^0x[0-9a-f]{40}$'),
  requested_amount numeric(30,18) not null check (requested_amount > 0),
  actual_amount numeric(30,18),
  fee_amount numeric(30,18) not null default 0 check (fee_amount >= 0),
  net_amount numeric(30,18),
  usd_rate numeric(30,10),
  usd_gross_amount numeric(30,2),
  usd_fee_amount numeric(30,2),
  usd_net_amount numeric(30,2),
  quote_source text,
  quoted_at timestamptz,
  status text not null default 'awaiting_transfer'
    check (status in ('awaiting_transfer','pending_verification','completed','failed','expired')),
  tx_hash text unique,
  transaction_id uuid references public.transactions(id) on delete restrict,
  idempotency_key text,
  expires_at timestamptz not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index if not exists wallet_deposit_intents_user_idx on public.wallet_deposit_intents(user_id, created_at desc);
create index if not exists wallet_deposit_intents_status_idx on public.wallet_deposit_intents(status, created_at desc);
create index if not exists wallet_deposit_configs_enabled_idx on public.wallet_deposit_configs(enabled, chain_id);

alter table public.wallet_deposit_configs enable row level security;
alter table public.wallet_deposit_intents enable row level security;

drop policy if exists wallet_deposit_configs_select on public.wallet_deposit_configs;
create policy wallet_deposit_configs_select on public.wallet_deposit_configs
  for select to authenticated using (enabled = true or public.is_admin());

drop policy if exists wallet_deposit_intents_select on public.wallet_deposit_intents;
create policy wallet_deposit_intents_select on public.wallet_deposit_intents
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.wallet_deposit_configs from anon, authenticated;
grant select on public.wallet_deposit_configs to authenticated;
revoke all on public.wallet_deposit_intents from anon, authenticated;
grant select on public.wallet_deposit_intents to authenticated;

create or replace function public.client_create_wallet_deposit_intent(
  p_wallet_id uuid, p_amount numeric, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_wallet public.client_wallets;
  v_cfg public.wallet_deposit_configs;
  v_intent public.wallet_deposit_intents;
  v_fee numeric;
  v_net numeric;
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 18) then
    raise exception 'Enter a valid amount.';
  end if;

  if v_key is not null then
    select * into v_intent from public.wallet_deposit_intents
    where user_id = v_uid and idempotency_key = v_key limit 1;
    if found then
      return jsonb_build_object(
        'intent_id',v_intent.id,'status',v_intent.status,'requested_amount',v_intent.requested_amount,
        'fee_amount',v_intent.fee_amount,'net_amount',v_intent.net_amount,
        'receiving_address',v_intent.receiving_address,'network',v_intent.network,
        'symbol',v_intent.symbol,'expires_at',v_intent.expires_at
      );
    end if;
  end if;

  select * into v_wallet from public.client_wallets
  where id = p_wallet_id and user_id = v_uid and status = 'linked'
    and verification_status = 'verified' for update;
  if not found then raise exception 'Choose a linked and verified wallet.'; end if;

  select * into v_cfg from public.wallet_deposit_configs
  where chain_id = v_wallet.chain_id and asset = 'native' and enabled = true for update;
  if not found then raise exception 'Deposits are not enabled for % yet. Please contact support.', v_wallet.network; end if;

  if lower(v_cfg.receiving_address) = lower(v_wallet.address) then
    raise exception 'The Tarafab receiving address cannot be the same as the sending wallet.';
  end if;
  if p_amount < v_cfg.min_amount then
    raise exception 'Minimum transfer is % %.', trim(to_char(v_cfg.min_amount,'FM999999999990.##################')), v_cfg.symbol;
  end if;
  if v_cfg.max_amount is not null and p_amount > v_cfg.max_amount then
    raise exception 'Maximum transfer is % %.', trim(to_char(v_cfg.max_amount,'FM999999999990.##################')), v_cfg.symbol;
  end if;

  v_fee := round((p_amount * v_cfg.fee_bps / 10000.0) + v_cfg.fixed_fee, 18);
  v_net := round(p_amount - v_fee, 18);
  if v_net <= 0 then raise exception 'The service fee is greater than the transfer amount.'; end if;

  insert into public.wallet_deposit_intents (
    user_id,wallet_id,chain_id,network,asset,symbol,from_address,receiving_address,
    requested_amount,fee_amount,net_amount,idempotency_key,expires_at
  ) values (
    v_uid,v_wallet.id,v_wallet.chain_id,v_wallet.network,'native',v_cfg.symbol,
    lower(v_wallet.address),lower(v_cfg.receiving_address),p_amount,v_fee,v_net,v_key,
    now()+interval '30 minutes'
  ) returning * into v_intent;

  return jsonb_build_object(
    'intent_id',v_intent.id,'status',v_intent.status,'requested_amount',v_intent.requested_amount,
    'fee_amount',v_intent.fee_amount,'net_amount',v_intent.net_amount,
    'receiving_address',v_intent.receiving_address,'network',v_intent.network,
    'symbol',v_intent.symbol,'expires_at',v_intent.expires_at
  );
end $$;

-- Service-role only. The Edge Function verifies the real transaction first.
-- Account balances are USD, so crypto deposits are valued using the verified
-- USD rate passed by the server-side verification layer.
create or replace function public.wallet_credit_verified_deposit(
  p_intent_id uuid, p_tx_hash text, p_actual_amount numeric, p_usd_rate numeric, p_quote_source text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_intent public.wallet_deposit_intents;
  v_cfg public.wallet_deposit_configs;
  v_acc public.accounts;
  v_tx public.transactions;
  v_fee numeric;
  v_net numeric;
  v_usd_gross numeric;
  v_usd_fee numeric;
  v_usd_net numeric;
begin
  if p_intent_id is null
     or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$'
     or p_actual_amount is null or p_actual_amount <= 0
     or p_usd_rate is null or p_usd_rate <= 0 then
    raise exception 'Invalid deposit verification request.';
  end if;

  select * into v_intent from public.wallet_deposit_intents where id = p_intent_id for update;
  if not found then raise exception 'Deposit request not found.'; end if;

  if v_intent.status = 'completed' then
    select * into v_tx from public.transactions where id = v_intent.transaction_id;
    return jsonb_build_object(
      'status','completed','transaction_id',v_tx.id,
      'usd_net_amount',v_intent.usd_net_amount,'fee_amount',v_intent.fee_amount
    );
  end if;

  if v_intent.status not in ('awaiting_transfer','pending_verification') then
    raise exception 'This deposit request is no longer active.';
  end if;
  if v_intent.expires_at < now() then
    update public.wallet_deposit_intents set status='expired',updated_at=now() where id=v_intent.id;
    raise exception 'This deposit request expired. Start a new transfer.';
  end if;

  if exists(select 1 from public.wallet_deposit_intents where tx_hash=lower(p_tx_hash) and id<>v_intent.id) then
    raise exception 'This blockchain transaction has already been used.';
  end if;

  select * into v_cfg from public.wallet_deposit_configs
  where chain_id=v_intent.chain_id and asset='native' and enabled=true for update;
  if not found then raise exception 'Deposits are currently disabled for this network.'; end if;

  v_fee := round((p_actual_amount*v_cfg.fee_bps/10000.0)+v_cfg.fixed_fee,18);
  v_net := round(p_actual_amount-v_fee,18);
  if v_net <= 0 then raise exception 'The service fee is greater than the received amount.'; end if;

  v_usd_gross := round(p_actual_amount*p_usd_rate,2);
  v_usd_fee := round(v_fee*p_usd_rate,2);
  v_usd_net := round(v_net*p_usd_rate,2);
  if v_usd_net <= 0 then raise exception 'The verified transfer value is too small to credit.'; end if;

  select * into v_acc from public.accounts where user_id=v_intent.user_id for update;
  if not found then raise exception 'Client account not found.'; end if;

  update public.accounts
    set account_balance=account_balance+v_usd_net,
        available_balance=available_balance+v_usd_net,
        updated_at=now()
  where id=v_acc.id;

  insert into public.transactions (
    user_id,type,method,amount,fee,asset,address,network,status,reference,notes
  ) values (
    v_intent.user_id,'deposit','wallet_transfer',v_usd_net,v_usd_fee,'USD',
    v_intent.from_address,v_intent.network,'completed',
    'WDEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    'External wallet transfer · gross '||
      trim(to_char(p_actual_amount,'FM999999999990.##################'))||' '||v_intent.symbol||
      ' · USD rate '||trim(to_char(p_usd_rate,'FM9999999990.##########'))||
      ' · Tarafab service fee '||trim(to_char(v_fee,'FM999999999990.##################'))||' '||v_intent.symbol||
      ' · USD credited '||trim(to_char(v_usd_net,'FM999999999990.00'))||
      ' · on-chain tx '||lower(p_tx_hash)
  ) returning * into v_tx;

  update public.wallet_deposit_intents set
    actual_amount=p_actual_amount, fee_amount=v_fee, net_amount=v_net,
    usd_rate=p_usd_rate, usd_gross_amount=v_usd_gross, usd_fee_amount=v_usd_fee,
    usd_net_amount=v_usd_net, quote_source=left(coalesce(p_quote_source,''),80),
    quoted_at=now(), status='completed', tx_hash=lower(p_tx_hash),
    transaction_id=v_tx.id, updated_at=now(), error_message=null
  where id=v_intent.id;

  insert into public.audit_logs(user_id,actor_id,target_user_id,action,entity,entity_id,details,result)
  values(
    v_intent.user_id,v_intent.user_id,v_intent.user_id,'WALLET_DEPOSIT_CREDITED',
    'wallet_deposit',v_intent.id::text,
    jsonb_build_object(
      'tx_hash',lower(p_tx_hash),'gross_amount',p_actual_amount,'fee_amount',v_fee,
      'net_amount',v_net,'usd_rate',p_usd_rate,'usd_gross_amount',v_usd_gross,
      'usd_fee_amount',v_usd_fee,'usd_net_amount',v_usd_net,
      'network',v_intent.network,'wallet_id',v_intent.wallet_id
    ),'success'
  );

  return jsonb_build_object(
    'status','completed','transaction_id',v_tx.id,'gross_amount',p_actual_amount,
    'fee_amount',v_fee,'net_amount',v_net,'usd_rate',p_usd_rate,
    'usd_net_amount',v_usd_net
  );
end $$;

create or replace function public.admin_upsert_wallet_deposit_config(
  p_chain_id integer,p_receiving_address text,p_enabled boolean,
  p_fee_bps integer default 0,p_fixed_fee numeric default 0,p_min_amount numeric default 0,
  p_max_amount numeric default null,p_confirmations integer default 1
) returns public.wallet_deposit_configs
language plpgsql security definer set search_path=public as $$
declare
  v_row public.wallet_deposit_configs;
  v_network text;
  v_symbol text;
  v_addr text := lower(trim(coalesce(p_receiving_address,'')));
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select case p_chain_id
    when 1 then 'Ethereum' when 8453 then 'Base' when 42161 then 'Arbitrum One'
    when 10 then 'OP Mainnet' when 137 then 'Polygon' when 56 then 'BNB Smart Chain'
  end into v_network;
  select case p_chain_id
    when 1 then 'ETH' when 8453 then 'ETH' when 42161 then 'ETH'
    when 10 then 'ETH' when 137 then 'POL' when 56 then 'BNB'
  end into v_symbol;
  if v_network is null then raise exception 'Unsupported network.'; end if;
  if v_addr !~ '^0x[0-9a-f]{40}$' then raise exception 'Enter a valid EVM receiving address.'; end if;
  if p_fee_bps < 0 or p_fee_bps > 10000 then raise exception 'Fee must be between 0% and 100%.'; end if;
  if p_fixed_fee is null or p_fixed_fee < 0 then raise exception 'Fixed fee cannot be negative.'; end if;
  if p_min_amount is null or p_min_amount < 0 then raise exception 'Minimum amount cannot be negative.'; end if;
  if p_max_amount is not null and p_max_amount <= 0 then raise exception 'Maximum amount must be positive.'; end if;
  if p_max_amount is not null and p_max_amount < p_min_amount then raise exception 'Maximum amount cannot be below minimum amount.'; end if;
  if p_confirmations < 1 or p_confirmations > 100 then raise exception 'Confirmations must be between 1 and 100.'; end if;

  insert into public.wallet_deposit_configs
    (chain_id,network,asset,symbol,receiving_address,enabled,fee_bps,fixed_fee,min_amount,max_amount,confirmations)
  values
    (p_chain_id,v_network,'native',v_symbol,v_addr,coalesce(p_enabled,false),p_fee_bps,p_fixed_fee,p_min_amount,p_max_amount,p_confirmations)
  on conflict(chain_id,asset) do update set
    network=excluded.network,symbol=excluded.symbol,receiving_address=excluded.receiving_address,
    enabled=excluded.enabled,fee_bps=excluded.fee_bps,fixed_fee=excluded.fixed_fee,
    min_amount=excluded.min_amount,max_amount=excluded.max_amount,
    confirmations=excluded.confirmations,updated_at=now()
  returning * into v_row;

  insert into public.audit_logs(user_id,actor_id,target_user_id,action,entity,entity_id,details)
  values(auth.uid(),auth.uid(),auth.uid(),'ADMIN_WALLET_DEPOSIT_CONFIG_UPDATED',
    'wallet_deposit_config',v_row.id::text,
    jsonb_build_object('chain_id',p_chain_id,'network',v_network,'enabled',p_enabled,
      'fee_bps',p_fee_bps,'fixed_fee',p_fixed_fee,'min_amount',p_min_amount,
      'max_amount',p_max_amount,'confirmations',p_confirmations));
  return v_row;
end $$;

create or replace function public.admin_list_wallet_deposit_configs()
returns setof public.wallet_deposit_configs
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select * from public.wallet_deposit_configs order by chain_id;
end $$;

revoke all on function public.client_create_wallet_deposit_intent(uuid,numeric,text) from public,anon;
revoke all on function public.wallet_credit_verified_deposit(uuid,text,numeric,numeric,text) from public,anon,authenticated;
revoke all on function public.admin_upsert_wallet_deposit_config(integer,text,boolean,integer,numeric,numeric,numeric,integer) from public,anon,authenticated;
revoke all on function public.admin_list_wallet_deposit_configs() from public,anon,authenticated;

grant execute on function public.client_create_wallet_deposit_intent(uuid,numeric,text) to authenticated;
grant execute on function public.wallet_credit_verified_deposit(uuid,text,numeric,numeric,text) to service_role;
grant execute on function public.admin_upsert_wallet_deposit_config(integer,text,boolean,integer,numeric,numeric,numeric,integer) to authenticated;
grant execute on function public.admin_list_wallet_deposit_configs() to authenticated;

notify pgrst,'reload schema';

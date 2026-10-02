-- Applied in four parts (20261023000101 service_fees, …0102 wallet_transfers,
-- …0103 premium). Contains no DROP statements: every policy and trigger here
-- is new, and triggers use CREATE OR REPLACE.
--
-- Service fees, external-wallet → Tarafab transfers, and Tarafab Premium.
--
-- Additive and backward-compatible: no existing table, row, column or
-- function is dropped. Money still moves only through the existing
-- accounts + transactions ledger:
--   * a verified wallet transfer is one 'deposit' transaction (gross amount,
--     fee column filled) plus one 'fee' transaction labelled
--     "Tarafab Service Fee"; the account is credited the net amount once;
--   * a withdrawal service fee (if an admin enables one) is deducted from the
--     withdrawn amount and recorded as a 'fee' transaction on approval — it
--     never moves the balance a second time.
-- Premium is an entitlement table driven by verified payment-provider events
-- (or an audited, clearly labelled admin override). Limits are enforced in
-- the database, never only in the browser.

-- =====================================================================
-- 1. Service fee rules
-- =====================================================================
create table if not exists public.service_fee_rules (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('wallet_transfer', 'withdrawal')),
  label text not null default 'Tarafab Service Fee',
  asset text,                       -- null = any asset
  chain_id integer,                 -- null = any network
  fixed_fee numeric(18,2) not null default 0 check (fixed_fee >= 0),
  pct_fee numeric(7,4) not null default 0 check (pct_fee >= 0 and pct_fee <= 50),
  min_fee numeric(18,2) not null default 0 check (min_fee >= 0),
  max_fee numeric(18,2) check (max_fee is null or max_fee >= 0),
  enabled boolean not null default false,
  effective_from timestamptz not null default now(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_fee is null or max_fee >= min_fee)
);
alter table public.service_fee_rules enable row level security;
create policy service_fee_rules_read on public.service_fee_rules for select to authenticated
  using ((enabled and effective_from <= now()) or public.is_admin());
revoke insert, update, delete on public.service_fee_rules from anon, authenticated;

-- The single place a service fee is calculated. Most specific enabled rule
-- wins (asset + network, then asset, then network, then general).
create or replace function public._service_fee(p_service text, p_asset text, p_chain_id integer, p_amount numeric)
returns table (fee numeric, rule_id uuid, label text)
language plpgsql stable security definer set search_path = public as $$
declare r public.service_fee_rules;
begin
  select * into r from public.service_fee_rules
   where service = p_service and enabled and effective_from <= now()
     and (asset is null or upper(asset) = upper(coalesce(p_asset, '')))
     and (chain_id is null or chain_id = p_chain_id)
   order by (asset is not null) desc, (chain_id is not null) desc, effective_from desc
   limit 1;
  if not found or p_amount is null or p_amount <= 0 then
    return query select 0::numeric, null::uuid, 'Tarafab Service Fee'::text; return;
  end if;
  fee := round(r.fixed_fee + p_amount * r.pct_fee / 100, 2);
  fee := greatest(fee, r.min_fee);
  if r.max_fee is not null then fee := least(fee, r.max_fee); end if;
  fee := least(fee, round(p_amount, 2));
  return query select fee, r.id, r.label;
end $$;
revoke all on function public._service_fee(text, text, integer, numeric) from public, anon, authenticated;

create or replace function public.quote_service_fee(p_service text, p_asset text, p_chain_id integer, p_amount numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q record;
begin
  if auth.uid() is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_service not in ('wallet_transfer', 'withdrawal') then raise exception 'Unknown service.'; end if;
  select * into q from public._service_fee(p_service, p_asset, p_chain_id, round(p_amount, 2));
  return jsonb_build_object('fee', q.fee, 'rule_id', q.rule_id, 'label', q.label, 'amount', round(p_amount, 2),
                            'net', greatest(round(p_amount, 2) - q.fee, 0));
end $$;
revoke all on function public.quote_service_fee(text, text, integer, numeric) from public, anon;
grant execute on function public.quote_service_fee(text, text, integer, numeric) to authenticated;

create or replace function public.admin_upsert_fee_rule(p_id uuid, p_service text, p_label text, p_asset text, p_chain_id integer,
  p_fixed numeric, p_pct numeric, p_min numeric, p_max numeric, p_enabled boolean, p_effective_from timestamptz, p_reason text)
returns public.service_fee_rules language plpgsql security definer set search_path = public as $$
declare r public.service_fee_rules; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if p_id is null then
    insert into public.service_fee_rules (service, label, asset, chain_id, fixed_fee, pct_fee, min_fee, max_fee, enabled, effective_from, updated_by)
    values (p_service, coalesce(nullif(trim(p_label), ''), 'Tarafab Service Fee'), nullif(upper(trim(p_asset)), ''), p_chain_id,
            coalesce(p_fixed, 0), coalesce(p_pct, 0), coalesce(p_min, 0), p_max, coalesce(p_enabled, false), coalesce(p_effective_from, now()), auth.uid())
    returning * into r;
  else
    select to_jsonb(f) into old from public.service_fee_rules f where id = p_id for update;
    if old is null then raise exception 'Fee rule not found.'; end if;
    update public.service_fee_rules set service = p_service, label = coalesce(nullif(trim(p_label), ''), 'Tarafab Service Fee'),
           asset = nullif(upper(trim(p_asset)), ''), chain_id = p_chain_id, fixed_fee = coalesce(p_fixed, 0), pct_fee = coalesce(p_pct, 0),
           min_fee = coalesce(p_min, 0), max_fee = p_max, enabled = coalesce(p_enabled, false),
           effective_from = coalesce(p_effective_from, effective_from), updated_by = auth.uid(), updated_at = now()
     where id = p_id returning * into r;
  end if;
  perform public._audit('fee_rule_saved', null, 'service_fee_rule', r.id::text,
    jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_upsert_fee_rule(uuid, text, text, text, integer, numeric, numeric, numeric, numeric, boolean, timestamptz, text) from public, anon;
grant execute on function public.admin_upsert_fee_rule(uuid, text, text, text, integer, numeric, numeric, numeric, numeric, boolean, timestamptz, text) to authenticated;

-- Withdrawal service fee: fixed when the request is made (deducted from the
-- withdrawn amount, shown to the client before confirming), recorded as its
-- own 'fee' transaction when the withdrawal is approved. Applies to both
-- existing withdrawal RPCs without changing them.
create or replace function public._withdrawal_fee_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare q record;
begin
  if new.type = 'withdrawal' and coalesce(new.fee, 0) = 0 then
    select * into q from public._service_fee('withdrawal', coalesce(new.asset, 'USD'), null, new.amount);
    new.fee := coalesce(q.fee, 0);
  end if;
  return new;
end $$;
create or replace trigger withdrawal_fee_on_request before insert on public.transactions
  for each row when (new.type = 'withdrawal') execute function public._withdrawal_fee_on_request();

create or replace function public._withdrawal_fee_on_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'withdrawal' and new.status = 'completed' and old.status <> 'completed' and coalesce(new.fee, 0) > 0 then
    insert into public.transactions (user_id, type, method, amount, status, reference, notes, direction, idempotency_key, asset, network)
    values (new.user_id, 'fee', 'service_fee', new.fee, 'completed', coalesce(new.reference, 'WDR') || '-FEE',
            'Tarafab Service Fee · withdrawal ' || coalesce(new.reference, new.id::text) || ' (deducted from the withdrawn amount)',
            'debit', 'wdr-fee-' || replace(new.id::text, '-', ''), new.asset, new.network)
    on conflict do nothing;
  end if;
  return new;
end $$;
create or replace trigger withdrawal_fee_on_complete after update of status on public.transactions
  for each row when (new.type = 'withdrawal') execute function public._withdrawal_fee_on_complete();

-- =====================================================================
-- 2. Tarafab receiving addresses + external wallet transfers
-- =====================================================================
create table if not exists public.deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  network text not null,
  asset text not null,                        -- pricing symbol (market_assets.id): ETH, USDC, USDT
  token_contract text check (token_contract is null or token_contract ~ '^0x[0-9a-f]{40}$'),
  decimals integer not null default 18 check (decimals between 0 and 36),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  min_confirmations integer not null default 12 check (min_confirmations between 1 and 200),
  enabled boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, asset)
);
alter table public.deposit_addresses enable row level security;
create policy deposit_addresses_read on public.deposit_addresses for select to authenticated using (enabled or public.is_admin());
revoke insert, update, delete on public.deposit_addresses from anon, authenticated;

create or replace function public.admin_upsert_deposit_address(p_id uuid, p_chain_id integer, p_network text, p_asset text,
  p_token_contract text, p_decimals integer, p_address text, p_min_confirmations integer, p_enabled boolean, p_reason text)
returns public.deposit_addresses language plpgsql security definer set search_path = public as $$
declare r public.deposit_addresses; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if lower(coalesce(p_address, '')) !~ '^0x[0-9a-f]{40}$' then raise exception 'Enter a valid 0x address.'; end if;
  if nullif(trim(p_token_contract), '') is not null and lower(trim(p_token_contract)) !~ '^0x[0-9a-f]{40}$' then raise exception 'Enter a valid token contract address.'; end if;
  if p_id is null then
    insert into public.deposit_addresses (chain_id, network, asset, token_contract, decimals, address, min_confirmations, enabled, updated_by)
    values (p_chain_id, trim(p_network), upper(trim(p_asset)), lower(nullif(trim(p_token_contract), '')), coalesce(p_decimals, 18),
            lower(trim(p_address)), coalesce(p_min_confirmations, 12), coalesce(p_enabled, true), auth.uid())
    returning * into r;
  else
    select to_jsonb(d) into old from public.deposit_addresses d where id = p_id for update;
    if old is null then raise exception 'Address not found.'; end if;
    update public.deposit_addresses set chain_id = p_chain_id, network = trim(p_network), asset = upper(trim(p_asset)),
           token_contract = lower(nullif(trim(p_token_contract), '')), decimals = coalesce(p_decimals, 18), address = lower(trim(p_address)),
           min_confirmations = coalesce(p_min_confirmations, 12), enabled = coalesce(p_enabled, true), updated_by = auth.uid(), updated_at = now()
     where id = p_id returning * into r;
  end if;
  perform public._audit('deposit_address_saved', null, 'deposit_address', r.id::text,
    jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_upsert_deposit_address(uuid, integer, text, text, text, integer, text, integer, boolean, text) from public, anon;
grant execute on function public.admin_upsert_deposit_address(uuid, integer, text, text, text, integer, text, integer, boolean, text) to authenticated;

create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  wallet_id uuid not null references public.client_wallets(id),
  deposit_address_id uuid not null references public.deposit_addresses(id),
  reference text not null unique default ('WTR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  chain_id integer not null,
  network text not null,
  asset text not null,
  token_contract text,
  decimals integer not null,
  from_address text not null,
  to_address text not null,
  quoted_amount numeric(38,18) not null check (quoted_amount > 0),
  usd_rate numeric(24,8) not null check (usd_rate > 0),
  quoted_usd numeric(18,2) not null,
  quoted_fee_usd numeric(18,2) not null default 0,
  quoted_credit_usd numeric(18,2) not null,
  fee_rule_id uuid,
  quote_expires_at timestamptz not null,
  tx_hash text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  submitted_at timestamptz,
  required_confirmations integer not null default 12,
  confirmations integer not null default 0,
  received_amount numeric(38,18),
  credit_rate numeric(24,8),
  gross_usd numeric(18,2),
  fee_usd numeric(18,2),
  credited_usd numeric(18,2),
  status text not null default 'awaiting_signature'
    check (status in ('awaiting_signature', 'submitted', 'confirming', 'credited', 'needs_review', 'failed', 'cancelled', 'expired')),
  error text,
  transaction_id uuid references public.transactions(id),
  fee_transaction_id uuid references public.transactions(id),
  idempotency_key text,
  last_checked_at timestamptz,
  credited_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One blockchain transaction can be claimed exactly once, by anyone.
create unique index if not exists wallet_transfers_chain_tx on public.wallet_transfers (chain_id, tx_hash) where tx_hash is not null;
create unique index if not exists wallet_transfers_user_idem on public.wallet_transfers (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists wallet_transfers_user_created on public.wallet_transfers (user_id, created_at desc);
create index if not exists wallet_transfers_pending on public.wallet_transfers (status) where status in ('submitted', 'confirming');
alter table public.wallet_transfers enable row level security;
create policy wallet_transfers_own on public.wallet_transfers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.wallet_transfers from anon, authenticated;

-- A fresh, real price for an asset from the market data the engine records.
create or replace function public._fresh_usd_rate(p_asset text)
returns numeric language sql stable security definer set search_path = public as $$
  select q.price from public.market_quotes q
   where q.asset_id = upper(p_asset) and q.price > 0 and q.state in ('live', 'delayed')
     and q.fetched_at > now() - interval '10 minutes'
$$;
revoke all on function public._fresh_usd_rate(text) from public, anon, authenticated;

create or replace function public.client_transfer_quote(p_wallet_id uuid, p_deposit_address_id uuid, p_amount numeric, p_idempotency_key text default null)
returns public.wallet_transfers language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_key text := public._check_idempotency_key(p_idempotency_key);
        w public.client_wallets; d public.deposit_addresses; r public.wallet_transfers; v_rate numeric; v_usd numeric; q record;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if v_key is not null then
    select * into r from public.wallet_transfers where user_id = v_uid and idempotency_key = v_key;
    if found then return r; end if;
  end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then
    raise exception 'Your account is suspended. Contact support.';
  end if;
  select * into w from public.client_wallets where id = p_wallet_id and user_id = v_uid and status = 'linked' and verification_status = 'verified';
  if not found then raise exception 'Connect and verify this wallet first.'; end if;
  select * into d from public.deposit_addresses where id = p_deposit_address_id and enabled;
  if not found then raise exception 'Transfers of this asset on this network are not available.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if (select count(*) from public.wallet_transfers where user_id = v_uid and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many transfer requests. Please wait a few minutes and try again.';
  end if;
  v_rate := public._fresh_usd_rate(d.asset);
  if v_rate is null then raise exception 'A current % price is not available right now, so the amount cannot be quoted. Try again shortly.', d.asset; end if;
  v_usd := round(p_amount * v_rate, 2);
  if v_usd < 1 then raise exception 'The transfer must be worth at least $1.00.'; end if;
  select * into q from public._service_fee('wallet_transfer', d.asset, d.chain_id, v_usd);
  if v_usd - q.fee <= 0 then raise exception 'This amount does not cover the Tarafab Service Fee.'; end if;
  insert into public.wallet_transfers (user_id, wallet_id, deposit_address_id, chain_id, network, asset, token_contract, decimals,
         from_address, to_address, quoted_amount, usd_rate, quoted_usd, quoted_fee_usd, quoted_credit_usd, fee_rule_id,
         quote_expires_at, required_confirmations, idempotency_key)
  values (v_uid, w.id, d.id, d.chain_id, d.network, d.asset, d.token_contract, d.decimals, lower(w.address), d.address,
          p_amount, v_rate, v_usd, q.fee, v_usd - q.fee, q.rule_id, now() + interval '15 minutes', d.min_confirmations, v_key)
  returning * into r;
  return r;
end $$;
revoke all on function public.client_transfer_quote(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.client_transfer_quote(uuid, uuid, numeric, text) to authenticated;

-- The wallet returned a transaction hash. Accepted even after the quote
-- expired (the funds may already be on their way); in that case the credit
-- uses the market price when the transfer is confirmed, and the client is told.
create or replace function public.client_transfer_submit(p_id uuid, p_tx_hash text)
returns public.wallet_transfers language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.wallet_transfers; v_hash text := lower(trim(coalesce(p_tx_hash, '')));
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'That is not a valid transaction hash.'; end if;
  select * into r from public.wallet_transfers where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if r.tx_hash = v_hash then return r; end if;                         -- repeated callback
  if r.status <> 'awaiting_signature' then raise exception 'This transfer was already submitted.'; end if;
  if exists (select 1 from public.wallet_transfers where chain_id = r.chain_id and tx_hash = v_hash) then
    raise exception 'This blockchain transaction has already been submitted.';
  end if;
  update public.wallet_transfers set tx_hash = v_hash, submitted_at = now(), status = 'submitted', updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;
revoke all on function public.client_transfer_submit(uuid, text) from public, anon;
grant execute on function public.client_transfer_submit(uuid, text) to authenticated;

create or replace function public.client_transfer_cancel(p_id uuid)
returns public.wallet_transfers language plpgsql security definer set search_path = public as $$
declare r public.wallet_transfers;
begin
  update public.wallet_transfers set status = 'cancelled', updated_at = now()
   where id = p_id and user_id = auth.uid() and status = 'awaiting_signature' returning * into r;
  if not found then raise exception 'Only a transfer that has not been sent can be cancelled.'; end if;
  return r;
end $$;
revoke all on function public.client_transfer_cancel(uuid) from public, anon;
grant execute on function public.client_transfer_cancel(uuid) to authenticated;

-- Verifier progress (service role only).
create or replace function public.engine_transfer_progress(p_id uuid, p_status text, p_confirmations integer, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('submitted', 'confirming', 'needs_review', 'failed') then raise exception 'Unsupported status'; end if;
  update public.wallet_transfers set status = p_status, confirmations = greatest(coalesce(p_confirmations, confirmations), 0),
         error = p_error, last_checked_at = now(), updated_at = now()
   where id = p_id and status in ('submitted', 'confirming');
end $$;

-- Credits a verified transfer exactly once (row lock + status check + unique
-- ledger idempotency keys). Shared by the verifier and the admin resolution.
create or replace function public._transfer_credit(p_id uuid, p_received numeric, p_rate numeric, p_confirmations integer, p_actor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.wallet_transfers; v_gross numeric; q record; v_net numeric; v_tx uuid; v_fee_tx uuid; v_acc public.accounts;
begin
  select * into r from public.wallet_transfers where id = p_id for update;
  if not found or r.status = 'credited' or r.transaction_id is not null then return false; end if;
  if r.status not in ('submitted', 'confirming', 'needs_review') then return false; end if;
  if p_received is null or p_received <= 0 or p_rate is null or p_rate <= 0 then raise exception 'Received amount and rate are required'; end if;
  v_gross := round(p_received * p_rate, 2);
  select * into q from public._service_fee('wallet_transfer', r.asset, r.chain_id, v_gross);
  v_net := round(v_gross - q.fee, 2);
  if v_net <= 0 then
    update public.wallet_transfers set status = 'needs_review', error = 'Received amount does not cover the service fee', updated_at = now() where id = p_id;
    return false;
  end if;
  select * into v_acc from public.accounts where user_id = r.user_id for update;
  if not found then raise exception 'Client account not found'; end if;

  insert into public.transactions (user_id, type, method, amount, fee, asset, address, network, tx_hash, reference, status, notes, direction, idempotency_key)
  values (r.user_id, 'deposit', 'wallet_transfer', v_gross, q.fee, r.asset, r.from_address, r.network, r.tx_hash, r.reference, 'completed',
          'Transfer from your verified wallet: ' || trim(to_char(p_received, 'FM999999999990.############')) || ' ' || r.asset ||
          ' at $' || trim(to_char(p_rate, 'FM999999999990.00######')) || '. Net credited $' || to_char(v_net, 'FM999999999990.00') || '.',
          'credit', 'wtr-' || replace(r.id::text, '-', ''))
  returning id into v_tx;
  if q.fee > 0 then
    insert into public.transactions (user_id, type, method, amount, asset, network, tx_hash, reference, status, notes, direction, idempotency_key)
    values (r.user_id, 'fee', 'service_fee', q.fee, r.asset, r.network, r.tx_hash, r.reference || '-FEE', 'completed',
            'Tarafab Service Fee · wallet transfer ' || r.reference, 'debit', 'wtr-fee-' || replace(r.id::text, '-', ''))
    returning id into v_fee_tx;
  end if;
  update public.accounts set account_balance = account_balance + v_net, available_balance = available_balance + v_net, updated_at = now()
   where id = v_acc.id;
  update public.wallet_transfers set status = 'credited', received_amount = p_received, credit_rate = p_rate, gross_usd = v_gross,
         fee_usd = q.fee, credited_usd = v_net, confirmations = greatest(coalesce(p_confirmations, confirmations), confirmations),
         transaction_id = v_tx, fee_transaction_id = v_fee_tx, credited_at = now(), error = null, resolved_by = p_actor,
         last_checked_at = now(), updated_at = now()
   where id = p_id;
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target)
  values (r.user_id, 'deposit', 'Wallet transfer credited',
          '$' || to_char(v_net, 'FM999,999,999,990.00') || ' was added to your Account Balance (' || r.reference || ').', 'View wallet', '#wallet');
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (p_actor, p_actor, r.user_id, 'wallet_transfer_credited', 'wallet_transfer', r.id::text,
          jsonb_build_object('reference', r.reference, 'tx_hash', r.tx_hash, 'chain_id', r.chain_id, 'asset', r.asset,
                             'received', p_received, 'rate', p_rate, 'gross_usd', v_gross, 'fee_usd', q.fee, 'credited_usd', v_net,
                             'transaction_id', v_tx, 'fee_transaction_id', v_fee_tx));
  return true;
end $$;
revoke all on function public._transfer_credit(uuid, numeric, numeric, integer, uuid) from public, anon, authenticated;

create or replace function public.engine_transfer_credit(p_id uuid, p_received numeric, p_rate numeric, p_confirmations integer)
returns boolean language sql security definer set search_path = public as $$
  select public._transfer_credit(p_id, p_received, p_rate, p_confirmations, null)
$$;

revoke all on function public.engine_transfer_progress(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.engine_transfer_credit(uuid, numeric, numeric, integer) from public, anon, authenticated;
grant execute on function public.engine_transfer_progress(uuid, text, integer, text) to service_role;
grant execute on function public.engine_transfer_credit(uuid, numeric, numeric, integer) to service_role;
grant execute on function public._fresh_usd_rate(text) to service_role;

-- Admin resolution of a transfer the verifier could not settle on its own
-- (sent from another address, amount mismatch...). Audited; the credit goes
-- through the same exactly-once path.
create or replace function public.admin_resolve_transfer(p_id uuid, p_action text, p_received numeric, p_rate numeric, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare r public.wallet_transfers;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into r from public.wallet_transfers where id = p_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if r.status not in ('needs_review', 'confirming', 'submitted') then raise exception 'This transfer is already %.', r.status; end if;
  if p_action = 'credit' then
    if not public._transfer_credit(p_id, coalesce(p_received, r.received_amount, r.quoted_amount), coalesce(p_rate, r.usd_rate), r.confirmations, auth.uid()) then
      raise exception 'The transfer could not be credited.';
    end if;
  elsif p_action = 'reject' then
    update public.wallet_transfers set status = 'failed', error = 'Closed by admin: ' || trim(p_reason), resolved_by = auth.uid(), updated_at = now() where id = p_id;
  else
    raise exception 'Unknown action.';
  end if;
  perform public._audit('wallet_transfer_' || p_action, r.user_id, 'wallet_transfer', p_id::text,
    jsonb_build_object('reference', r.reference, 'received', p_received, 'rate', p_rate, 'reason', trim(p_reason)));
  return p_action;
end $$;
revoke all on function public.admin_resolve_transfer(uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.admin_resolve_transfer(uuid, text, numeric, numeric, text) to authenticated;

create or replace function public.admin_list_transfers(p_status text default null, p_limit integer default 100)
returns table (id uuid, reference text, user_id uuid, full_name text, email text, chain_id integer, network text, asset text,
  from_address text, to_address text, tx_hash text, quoted_amount numeric, received_amount numeric, usd_rate numeric, credit_rate numeric,
  quoted_credit_usd numeric, gross_usd numeric, fee_usd numeric, credited_usd numeric, confirmations integer, required_confirmations integer,
  status text, error text, transaction_id uuid, fee_transaction_id uuid, ledger_amount numeric, ledger_status text,
  fee_ledger_amount numeric, created_at timestamptz, submitted_at timestamptz, credited_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select t.id, t.reference, t.user_id, p.full_name, u.email::text, t.chain_id, t.network, t.asset, t.from_address, t.to_address, t.tx_hash,
         t.quoted_amount, t.received_amount, t.usd_rate, t.credit_rate, t.quoted_credit_usd, t.gross_usd, t.fee_usd, t.credited_usd,
         t.confirmations, t.required_confirmations, t.status, t.error, t.transaction_id, t.fee_transaction_id,
         lt.amount, lt.status, lf.amount, t.created_at, t.submitted_at, t.credited_at
    from public.wallet_transfers t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    left join public.transactions lt on lt.id = t.transaction_id
    left join public.transactions lf on lf.id = t.fee_transaction_id
   where p_status is null or t.status = p_status
   order by t.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke all on function public.admin_list_transfers(text, integer) from public, anon;
grant execute on function public.admin_list_transfers(text, integer) to authenticated;

create or replace function public.admin_fee_report(p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 200)
returns table (id uuid, created_at timestamptz, user_id uuid, full_name text, email text, method text, amount numeric,
  reference text, notes text, status text, asset text, network text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select t.id, t.created_at, t.user_id, p.full_name, u.email::text, t.method, t.amount, t.reference, t.notes, t.status, t.asset, t.network
    from public.transactions t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
   where t.type = 'fee' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)
   order by t.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;
revoke all on function public.admin_fee_report(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.admin_fee_report(timestamptz, timestamptz, integer) to authenticated;

-- =====================================================================
-- 3. Tarafab Premium
-- =====================================================================
create table if not exists public.premium_settings (
  id integer primary key default 1 check (id = 1),
  free_automation_limit integer not null default 5 check (free_automation_limit between 0 and 1000),
  premium_automation_limit integer not null default 50 check (premium_automation_limit between 0 and 1000),
  free_watchlist_limit integer not null default 20 check (free_watchlist_limit between 0 and 1000),
  premium_watchlist_limit integer not null default 200 check (premium_watchlist_limit between 0 and 1000),
  premium_timeframes text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.premium_settings (id) values (1) on conflict do nothing;
alter table public.premium_settings enable row level security;
create policy premium_settings_read on public.premium_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.premium_settings from anon, authenticated;

create table if not exists public.premium_plans (
  id text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  name text not null,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  price numeric(10,2) not null check (price > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  promo_price numeric(10,2) check (promo_price is null or promo_price > 0),
  promo_label text,
  provider_price_id text,           -- payment provider price (e.g. Stripe price_...)
  enabled boolean not null default false,
  sort_order integer not null default 0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.premium_plans enable row level security;
create policy premium_plans_read on public.premium_plans for select to anon, authenticated using (enabled or public.is_admin());
revoke insert, update, delete on public.premium_plans from anon, authenticated;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  plan_id text references public.premium_plans(id),
  status text not null check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  source text not null check (source in ('payment', 'admin_override')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.subscriptions from anon, authenticated;

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  subscription_id uuid,
  source text not null check (source in ('payment', 'admin_override')),
  event_type text not null,
  provider_event_id text unique,    -- webhook replay protection
  actor_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.subscription_events enable row level security;
create policy subscription_events_admin on public.subscription_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.subscription_events from anon, authenticated;

-- The server-side entitlement check.
create or replace function public._premium_status(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.status in ('active', 'trial') and s.current_period_end is not null and s.current_period_end > now() then 'premium'
      when s.status in ('active', 'trial') then 'expired'
      else s.status end
      from public.subscriptions s where s.user_id = p_user), 'free')
$$;
create or replace function public._is_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._premium_status(p_user) = 'premium'
$$;
revoke all on function public._premium_status(uuid) from public, anon, authenticated;
revoke all on function public._is_premium(uuid) from public, anon, authenticated;
grant execute on function public._is_premium(uuid) to service_role;

create or replace function public.client_premium_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.subscriptions; st public.premium_settings; v_status text; v_prem boolean;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into st from public.premium_settings where id = 1;
  select * into s from public.subscriptions where user_id = v_uid;
  v_status := public._premium_status(v_uid);
  v_prem := v_status = 'premium';
  return jsonb_build_object(
    'status', v_status, 'premium', v_prem,
    'subscription', case when s.id is null then null else jsonb_build_object('plan_id', s.plan_id, 'status', s.status, 'source', s.source,
        'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end, 'cancelled_at', s.cancelled_at) end,
    'limits', jsonb_build_object(
        'automations', case when v_prem then st.premium_automation_limit else st.free_automation_limit end,
        'watchlist', case when v_prem then st.premium_watchlist_limit else st.free_watchlist_limit end,
        'free_automations', st.free_automation_limit, 'premium_automations', st.premium_automation_limit,
        'free_watchlist', st.free_watchlist_limit, 'premium_watchlist', st.premium_watchlist_limit),
    'usage', jsonb_build_object(
        'automations', (select count(*) from public.automations where user_id = v_uid and status = 'active'),
        'watchlist', (select count(*) from public.client_watchlist where user_id = v_uid)),
    'premium_timeframes', to_jsonb(st.premium_timeframes),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'interval', p.billing_interval, 'price', p.price,
        'currency', p.currency, 'promo_price', p.promo_price, 'promo_label', p.promo_label, 'checkout', p.provider_price_id is not null)
        order by p.sort_order, p.price) from public.premium_plans p where p.enabled), '[]'::jsonb));
end $$;
revoke all on function public.client_premium_info() from public, anon;
grant execute on function public.client_premium_info() to authenticated;

-- Premium chart timeframes are checked on the server.
create or replace function public.client_can_use_timeframe(p_tf text)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select p_tf = any (premium_timeframes) from public.premium_settings where id = 1), false)
      or (auth.uid() is not null and public._is_premium(auth.uid()))
$$;
grant execute on function public.client_can_use_timeframe(text) to anon, authenticated;

-- Limits enforced on every path that makes an automation active (create,
-- duplicate, resume, re-arm) — a per-user lock prevents concurrent bypass.
create or replace function public._automation_active_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_n integer; v_prem boolean;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  -- The engine never activates rules; only client/admin actions do.
  perform pg_advisory_xact_lock(hashtext('tarafab-automation-limit:' || new.user_id::text));
  v_prem := public._is_premium(new.user_id);
  select case when v_prem then premium_automation_limit else free_automation_limit end into v_limit from public.premium_settings where id = 1;
  select count(*) into v_n from public.automations where user_id = new.user_id and status = 'active' and id <> new.id;
  if v_n >= coalesce(v_limit, 5) then
    raise exception '%', case when v_prem then format('You have reached the Premium limit of %s active automations.', v_limit)
                              else format('You have reached the free limit of %s active automations. Upgrade to Tarafab Premium for more.', v_limit) end
      using errcode = 'P0001', hint = 'premium_limit';
  end if;
  return new;
end $$;
create or replace trigger automation_active_limit before insert or update of status on public.automations
  for each row execute function public._automation_active_limit();

-- Replaces the hardcoded 50 cap with the configurable active limit (trigger)
-- plus a generous total cap for paused rules. Behaviour is otherwise unchanged.
create or replace function public.client_automation_create(p_asset text, p_kind text, p_target numeric, p_name text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a public.automations%rowtype;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select * into a from public.automations where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then return to_jsonb(a); end if;
  end if;
  perform public._automation_validate(p_asset, p_kind, p_target);
  if (select count(*) from public.automations where user_id = v_uid and status in ('active', 'paused')) >= 1000 then
    raise exception 'You can keep up to 1000 active or paused automations.';
  end if;
  insert into public.automations (user_id, asset_id, kind, target, name, idempotency_key)
  values (v_uid, p_asset, p_kind, round(p_target, 8), left(trim(coalesce(p_name, '')), 80), p_idempotency_key)
  returning * into a;
  perform public._automation_event(a.id, v_uid, 'created', jsonb_build_object('asset', p_asset, 'kind', p_kind, 'target', a.target));
  return to_jsonb(a);
end $$;

create or replace function public.client_watchlist_set(p_asset text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int; v_limit int; v_prem boolean;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_on then
    if not exists (select 1 from public.market_assets where id = p_asset and enabled and visible) then raise exception 'This asset is not available.'; end if;
    if exists (select 1 from public.client_watchlist where user_id = v_uid and asset_id = p_asset) then
      return jsonb_build_object('asset', p_asset, 'on', true);
    end if;
    perform pg_advisory_xact_lock(hashtext('tarafab-watchlist-limit:' || v_uid::text));
    v_prem := public._is_premium(v_uid);
    select case when v_prem then premium_watchlist_limit else free_watchlist_limit end into v_limit from public.premium_settings where id = 1;
    select count(*) into v_n from public.client_watchlist where user_id = v_uid;
    if v_n >= coalesce(v_limit, 20) then
      raise exception '%', case when v_prem then format('Your watchlist is full (%s assets).', v_limit)
                                else format('The free watchlist holds %s assets. Upgrade to Tarafab Premium for more.', v_limit) end
        using errcode = 'P0001', hint = 'premium_limit';
    end if;
    insert into public.client_watchlist (user_id, asset_id, position) values (v_uid, p_asset, v_n) on conflict do nothing;
  else
    delete from public.client_watchlist where user_id = v_uid and asset_id = p_asset;
  end if;
  return jsonb_build_object('asset', p_asset, 'on', p_on);
end $$;

-- ---------- Premium administration ----------
create or replace function public.admin_update_premium_settings(p_free_auto integer, p_premium_auto integer, p_free_wl integer,
  p_premium_wl integer, p_premium_timeframes text[], p_reason text)
returns public.premium_settings language plpgsql security definer set search_path = public as $$
declare r public.premium_settings; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if exists (select 1 from unnest(coalesce(p_premium_timeframes, '{}')) x where x not in ('1H', '4H', '1D', '1W', '1M', '1Y')) then
    raise exception 'Unknown timeframe.';
  end if;
  select to_jsonb(s) into old from public.premium_settings s where id = 1 for update;
  update public.premium_settings set free_automation_limit = p_free_auto, premium_automation_limit = p_premium_auto,
         free_watchlist_limit = p_free_wl, premium_watchlist_limit = p_premium_wl,
         premium_timeframes = coalesce(p_premium_timeframes, '{}'), updated_by = auth.uid(), updated_at = now()
   where id = 1 returning * into r;
  perform public._audit('premium_settings_saved', null, 'premium_settings', '1', jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_update_premium_settings(integer, integer, integer, integer, text[], text) from public, anon;
grant execute on function public.admin_update_premium_settings(integer, integer, integer, integer, text[], text) to authenticated;

create or replace function public.admin_upsert_plan(p_id text, p_name text, p_interval text, p_price numeric, p_currency text,
  p_promo_price numeric, p_promo_label text, p_provider_price_id text, p_enabled boolean, p_sort integer, p_reason text)
returns public.premium_plans language plpgsql security definer set search_path = public as $$
declare r public.premium_plans; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select to_jsonb(p) into old from public.premium_plans p where id = p_id for update;
  insert into public.premium_plans (id, name, billing_interval, price, currency, promo_price, promo_label, provider_price_id, enabled, sort_order, updated_by)
  values (lower(trim(p_id)), trim(p_name), p_interval, p_price, upper(coalesce(nullif(trim(p_currency), ''), 'USD')), p_promo_price,
          nullif(trim(p_promo_label), ''), nullif(trim(p_provider_price_id), ''), coalesce(p_enabled, false), coalesce(p_sort, 0), auth.uid())
  on conflict (id) do update set name = excluded.name, billing_interval = excluded.billing_interval, price = excluded.price,
     currency = excluded.currency, promo_price = excluded.promo_price, promo_label = excluded.promo_label,
     provider_price_id = excluded.provider_price_id, enabled = excluded.enabled, sort_order = excluded.sort_order,
     updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  perform public._audit('premium_plan_saved', null, 'premium_plan', r.id, jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_upsert_plan(text, text, text, numeric, text, numeric, text, text, boolean, integer, text) from public, anon;
grant execute on function public.admin_upsert_plan(text, text, text, numeric, text, numeric, text, text, boolean, integer, text) to authenticated;

-- A manual grant/revoke for support cases. It is labelled 'admin_override'
-- everywhere, audited, never recorded as a payment, and keeps any payment
-- provider references intact.
create or replace function public.admin_set_subscription_override(p_user uuid, p_plan text, p_status text, p_period_end timestamptz, p_reason text)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare r public.subscriptions; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if p_status not in ('trial', 'active', 'cancelled', 'expired') then raise exception 'Unsupported status.'; end if;
  if p_status in ('trial', 'active') and (p_period_end is null or p_period_end <= now()) then raise exception 'Choose an end date in the future.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Client not found.'; end if;
  select to_jsonb(s) into old from public.subscriptions s where user_id = p_user for update;
  insert into public.subscriptions (user_id, plan_id, status, source, current_period_start, current_period_end, override_reason,
         cancelled_at)
  values (p_user, nullif(p_plan, ''), p_status, 'admin_override', now(), p_period_end, trim(p_reason),
          case when p_status in ('cancelled', 'expired') then now() end)
  on conflict (user_id) do update set plan_id = coalesce(nullif(p_plan, ''), subscriptions.plan_id), status = p_status, source = 'admin_override',
     current_period_end = p_period_end, override_reason = trim(p_reason),
     cancelled_at = case when p_status in ('cancelled', 'expired') then now() else null end, updated_at = now()
  returning * into r;
  insert into public.subscription_events (user_id, subscription_id, source, event_type, actor_id, details)
  values (p_user, r.id, 'admin_override', 'override_' || p_status, auth.uid(),
          jsonb_build_object('before', old, 'plan', p_plan, 'period_end', p_period_end, 'reason', trim(p_reason)));
  perform public._audit('premium_override', p_user, 'subscription', r.id::text,
          jsonb_build_object('before', old, 'status', p_status, 'plan', p_plan, 'period_end', p_period_end, 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_set_subscription_override(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_subscription_override(uuid, text, text, timestamptz, text) to authenticated;

create or replace function public.admin_list_subscriptions(p_status text default null, p_limit integer default 200)
returns table (user_id uuid, full_name text, email text, plan_id text, status text, entitlement text, source text, provider text,
  current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean, cancelled_at timestamptz,
  created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select s.user_id, p.full_name, u.email::text, s.plan_id, s.status, public._premium_status(s.user_id), s.source, s.provider,
         s.current_period_start, s.current_period_end, s.cancel_at_period_end, s.cancelled_at, s.created_at, s.updated_at
    from public.subscriptions s
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
   where p_status is null or s.status = p_status
   order by s.updated_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;
revoke all on function public.admin_list_subscriptions(text, integer) from public, anon;
grant execute on function public.admin_list_subscriptions(text, integer) to authenticated;

-- Payment provider events (service role only, called by the billing Edge
-- Function after it verified the provider's webhook signature). Replays of
-- the same provider event are ignored.
create or replace function public.billing_apply_subscription(p_event_id text, p_event_type text, p_user uuid, p_plan text, p_status text,
  p_provider text, p_customer text, p_subscription text, p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_details jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.subscriptions;
begin
  if p_status not in ('trial', 'active', 'past_due', 'cancelled', 'expired') then raise exception 'Unsupported status'; end if;
  begin
    insert into public.subscription_events (user_id, source, event_type, provider_event_id, details)
    values (p_user, 'payment', p_event_type, p_event_id, coalesce(p_details, '{}'));
  exception when unique_violation then return false;
  end;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'Unknown user for this subscription'; end if;
  insert into public.subscriptions (user_id, plan_id, status, source, provider, provider_customer_id, provider_subscription_id,
         current_period_start, current_period_end, cancel_at_period_end, cancelled_at)
  values (p_user, (select id from public.premium_plans where id = p_plan), p_status, 'payment', p_provider, p_customer, p_subscription,
          p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false), case when p_status in ('cancelled', 'expired') then now() end)
  on conflict (user_id) do update set plan_id = coalesce((select id from public.premium_plans where id = p_plan), subscriptions.plan_id),
     status = p_status, source = 'payment', provider = p_provider,
     provider_customer_id = coalesce(p_customer, subscriptions.provider_customer_id),
     provider_subscription_id = coalesce(p_subscription, subscriptions.provider_subscription_id),
     current_period_start = coalesce(p_period_start, subscriptions.current_period_start),
     current_period_end = coalesce(p_period_end, subscriptions.current_period_end),
     cancel_at_period_end = coalesce(p_cancel_at_period_end, false), override_reason = null,
     cancelled_at = case when p_status in ('cancelled', 'expired') then coalesce(subscriptions.cancelled_at, now()) else null end,
     updated_at = now()
  returning * into r;
  update public.subscription_events set subscription_id = r.id where provider_event_id = p_event_id;
  return true;
end $$;
revoke all on function public.billing_apply_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, jsonb) to service_role;

notify pgrst, 'reload schema';

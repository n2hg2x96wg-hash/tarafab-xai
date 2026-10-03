-- 1) Fee rules: 'ANY' / '*' / 'ALL' / blank in the asset field is a wildcard.
--    A rule saved with asset 'ANY' (typed in Admin) was compared literally and
--    never matched anything. Matching now treats these as "any asset"; stored
--    rows are not modified. Future saves store a wildcard as NULL.
create or replace function public._fee_asset_wild(p_asset text) returns boolean
language sql immutable as $$ select upper(trim(coalesce(p_asset, ''))) in ('', 'ANY', '*', 'ALL') $$;

create or replace function public._service_fee(p_service text, p_asset text, p_chain_id integer, p_amount numeric)
returns table(fee numeric, rule_id uuid, label text)
language plpgsql stable security definer set search_path to 'public' as $function$
declare r public.service_fee_rules;
begin
  -- Most specific enabled rule wins: asset + network, asset, network, general.
  select * into r from public.service_fee_rules
   where service = p_service and enabled and effective_from <= now()
     and (public._fee_asset_wild(asset) or upper(trim(asset)) = upper(trim(coalesce(p_asset, ''))))
     and (chain_id is null or chain_id = p_chain_id)
   order by (not public._fee_asset_wild(asset)) desc, (chain_id is not null) desc, effective_from desc
   limit 1;
  if not found or p_amount is null or p_amount <= 0 then
    return query select 0::numeric, null::uuid, 'Tarafab Service Fee'::text; return;
  end if;
  -- Fee = fixed + percentage, kept between min and max (max caps the FEE),
  -- never more than the amount.
  fee := round(r.fixed_fee + p_amount * r.pct_fee / 100, 2);
  fee := greatest(fee, r.min_fee);
  if r.max_fee is not null then fee := least(fee, r.max_fee); end if;
  fee := least(fee, round(p_amount, 2));
  return query select fee, r.id, r.label;
end $function$;

create or replace function public.admin_upsert_fee_rule(p_id uuid, p_service text, p_label text, p_asset text, p_chain_id integer, p_fixed numeric, p_pct numeric, p_min numeric, p_max numeric, p_enabled boolean, p_effective_from timestamp with time zone, p_reason text)
returns public.service_fee_rules language plpgsql security definer set search_path to 'public' as $function$
declare r public.service_fee_rules; old jsonb; v_asset text := case when public._fee_asset_wild(p_asset) then null else upper(trim(p_asset)) end;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if p_id is null then
    insert into public.service_fee_rules (service, label, asset, chain_id, fixed_fee, pct_fee, min_fee, max_fee, enabled, effective_from, updated_by)
    values (p_service, coalesce(nullif(trim(p_label), ''), 'Tarafab Service Fee'), v_asset, p_chain_id,
            coalesce(p_fixed, 0), coalesce(p_pct, 0), coalesce(p_min, 0), p_max, coalesce(p_enabled, false), coalesce(p_effective_from, now()), auth.uid())
    returning * into r;
  else
    select to_jsonb(f) into old from public.service_fee_rules f where id = p_id for update;
    if old is null then raise exception 'Fee rule not found.'; end if;
    update public.service_fee_rules set service = p_service, label = coalesce(nullif(trim(p_label), ''), 'Tarafab Service Fee'),
           asset = v_asset, chain_id = p_chain_id, fixed_fee = coalesce(p_fixed, 0), pct_fee = coalesce(p_pct, 0),
           min_fee = coalesce(p_min, 0), max_fee = p_max, enabled = coalesce(p_enabled, false),
           effective_from = coalesce(p_effective_from, effective_from), updated_by = auth.uid(), updated_at = now()
     where id = p_id returning * into r;
  end if;
  perform public._audit('fee_rule_saved', null, 'service_fee_rule', r.id::text,
    jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $function$;

-- 2) Crypto deposits for every enabled, valid receiving address (not only
--    ETH). Same safety as before: pending_review, one claim per tx hash,
--    nothing credited until an admin verifies on-chain.
create or replace function public.client_submit_crypto_deposit(p_asset text, p_chain_id integer, p_amount numeric, p_crypto_amount numeric,
  p_tx_hash text, p_from_address text, p_notes text default null, p_idempotency_key text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_tx public.transactions; v_key text := public._check_idempotency_key(p_idempotency_key);
        d public.deposit_addresses; v_hash text := lower(trim(coalesce(p_tx_hash, ''))); v_from text := lower(trim(coalesce(p_from_address, '')));
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;
  select * into d from public.deposit_addresses where enabled and upper(asset) = upper(trim(coalesce(p_asset, ''))) and chain_id = p_chain_id limit 1;
  if not found then raise exception 'This deposit option is temporarily unavailable.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_crypto_amount is null or p_crypto_amount <= 0 then raise exception 'Enter the amount of % you sent.', d.asset; end if;
  if v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'Enter a valid transaction hash (0x followed by 64 characters).'; end if;
  if v_from !~ '^0x[0-9a-f]{40}$' then raise exception 'Enter the address you sent from (0x followed by 40 characters).'; end if;
  if v_from = d.address then raise exception 'The sender address cannot be the Tarafab receiving address.'; end if;
  if exists (select 1 from public.transactions where lower(tx_hash) = v_hash and type = 'deposit' and status not in ('rejected', 'failed', 'cancelled'))
     or exists (select 1 from public.wallet_transfers where lower(tx_hash) = v_hash) then
    raise exception 'This transaction has already been submitted.';
  end if;
  if (select count(*) from public.transactions where user_id = v_uid and type = 'deposit' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many deposit submissions. Please wait a few minutes and try again.';
  end if;
  begin
    insert into public.transactions (user_id, type, method, amount, status, reference, asset, network, address, tx_hash, notes, idempotency_key)
    values (v_uid, 'deposit', case when d.asset = 'ETH' and d.chain_id = 1 then 'ethereum' else lower(d.asset) || '_' || d.chain_id end,
            round(p_amount, 2), 'pending_review', 'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
            d.asset, d.network, v_from, v_hash,
            concat_ws(' | ', d.asset || ' sent: ' || trim(to_char(p_crypto_amount, 'FM999999999990.000000000000000000')),
                      'network ' || d.network || ' (chain ' || d.chain_id || ')', case when d.token_contract is not null then 'token ' || d.token_contract end,
                      'to ' || d.address, 'verify on-chain: ' || d.min_confirmations || '+ confirmations', nullif(trim(coalesce(p_notes, '')), '')),
            v_key)
    returning * into v_tx;
  exception when unique_violation then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
  end;
  return v_tx;
end $$;
revoke all on function public.client_submit_crypto_deposit(text, integer, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.client_submit_crypto_deposit(text, integer, numeric, numeric, text, text, text, text) to authenticated;

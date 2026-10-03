-- Outbound "External Wallet Transfer": a withdrawal to one of the client's
-- linked & verified external wallets. Separate fee service
-- ('wallet_withdrawal') with its own rules; "Normal Withdrawal" ('withdrawal')
-- and the inbound "External wallet → Tarafab transfer" ('wallet_transfer') are
-- unchanged. Additive: no rows are modified; historical fees are kept.

alter table public.service_fee_rules drop constraint service_fee_rules_service_check,
  add constraint service_fee_rules_service_check check (service in ('wallet_transfer', 'withdrawal', 'wallet_withdrawal'));

-- Which fee service a NEW withdrawal was charged under (null on older rows).
alter table public.transactions add column if not exists fee_service text;

-- Server-side classification (the browser never chooses the service): a
-- destination that is one of the user's linked & verified wallets is an
-- External Wallet Transfer; anything else is a Normal Withdrawal.
create or replace function public._withdrawal_service(p_user uuid, p_address text) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.client_wallets w where w.user_id = p_user and lower(w.address) = lower(trim(coalesce(p_address, '')))
                           and w.status = 'linked' and w.verification_status = 'verified')
              then 'wallet_withdrawal' else 'withdrawal' end
$$;
revoke all on function public._withdrawal_service(uuid, text) from public, anon, authenticated;

create or replace function public._withdrawal_fee_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare q record; sc record; v_service text;
begin
  if new.type = 'withdrawal' and coalesce(new.fee, 0) = 0 then
    v_service := public._withdrawal_service(new.user_id, new.address);
    select * into sc from public._network_fee_scope(new.network);
    select * into q from public._service_fee(v_service, coalesce(sc.asset, nullif(new.asset, 'USD'), 'USD'), sc.chain_id, new.amount);
    new.fee := coalesce(q.fee, 0);
    new.fee_service := v_service;
  end if;
  return new;
end $$;

-- Preview with the same classification. With p_wallet_id the destination is
-- that linked wallet (its network decides the scope); otherwise a manually
-- entered destination on p_network (Normal Withdrawal).
create or replace function public.quote_withdrawal_fee_v2(p_network text, p_amount numeric, p_wallet_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); w public.client_wallets; sc record; q record; v_service text := 'withdrawal'; v_net text := p_network;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_wallet_id is not null then
    select * into w from public.client_wallets where id = p_wallet_id and user_id = v_uid and status = 'linked' and verification_status = 'verified';
    if not found then raise exception 'Choose a linked and verified wallet'; end if;
    v_service := 'wallet_withdrawal'; v_net := w.network;
  end if;
  select * into sc from public._network_fee_scope(v_net);
  select * into q from public._service_fee(v_service, sc.asset, sc.chain_id, round(p_amount, 2));
  return jsonb_build_object('service', v_service, 'network', v_net, 'asset', sc.asset, 'chain_id', sc.chain_id,
    'fee', q.fee, 'rule_id', q.rule_id, 'label', q.label, 'amount', round(p_amount, 2), 'net', greatest(round(p_amount, 2) - q.fee, 0));
end $$;
revoke all on function public.quote_withdrawal_fee_v2(text, numeric, uuid) from public, anon;
grant execute on function public.quote_withdrawal_fee_v2(text, numeric, uuid) to authenticated;

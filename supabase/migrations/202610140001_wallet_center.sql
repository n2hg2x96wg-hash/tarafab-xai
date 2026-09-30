-- Wallet Center: non-custodial external wallet links with signed-message
-- ownership verification. Additive only: two new tables, their RLS, and
-- functions. No existing table, row or function body is changed except the
-- optional client-menu list, which gains 'wallet'.
--
-- What is stored: user id, public address, chain id / network, status,
-- verification timestamps. What is never stored: private keys, recovery
-- phrases, or the signature (it is checked once by the wallet-verify Edge
-- Function and discarded). Events go to the existing audit_logs table.

create table if not exists public.client_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain text not null default 'evm' check (chain in ('evm')),
  chain_id integer not null check (chain_id > 0),
  network text not null,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),   -- stored lowercase
  label text not null default '' check (char_length(label) <= 60),
  wallet_name text not null default '' check (char_length(wallet_name) <= 60),
  status text not null default 'linked' check (status in ('linked', 'unlinked', 'revoked')),
  verification_status text not null default 'verified' check (verification_status in ('verified', 'unverified')),
  linked_at timestamptz not null default now(),
  verified_at timestamptz,
  last_verified_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id),
  end_reason text check (char_length(end_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live link per address across the platform (an address can belong to
-- one Tarafab account at a time); history rows (unlinked/revoked) are kept.
create unique index if not exists client_wallets_one_live_link
  on public.client_wallets (chain, address) where status = 'linked';
create index if not exists client_wallets_user_idx on public.client_wallets (user_id, created_at desc);
create index if not exists client_wallets_admin_idx on public.client_wallets (status, chain_id, created_at desc);

create table if not exists public.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer not null,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wallet_challenges_user_idx on public.wallet_challenges (user_id, created_at desc);

alter table public.client_wallets enable row level security;
alter table public.wallet_challenges enable row level security;

-- Clients read only their own wallets; admins read all. No direct writes for
-- anyone: every change goes through the functions below.
drop policy if exists client_wallets_select on public.client_wallets;
create policy client_wallets_select on public.client_wallets
  for select using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.client_wallets from anon;
revoke all on public.client_wallets from authenticated;
grant select on public.client_wallets to authenticated;

-- Challenges are only ever touched through functions.
revoke all on public.wallet_challenges from anon, authenticated;

create or replace function public._wallet_networks()
returns jsonb language sql immutable set search_path = public as $$
  select '{"1":"Ethereum","8453":"Base","42161":"Arbitrum One","10":"OP Mainnet","137":"Polygon","56":"BNB Smart Chain"}'::jsonb
$$;

-- Step 1 (client): a single-use, 10-minute message to sign. It asks for no
-- transaction and no funds. At most 10 open challenges per client per hour.
create or replace function public.client_wallet_challenge(p_address text, p_chain_id integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_addr text := lower(trim(coalesce(p_address, '')));
  v_net text := public._wallet_networks() ->> p_chain_id::text;
  v_nonce text := replace(gen_random_uuid()::text, '-', '');
  v_now timestamptz := now();
  v_msg text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if v_addr !~ '^0x[0-9a-f]{40}$' then raise exception 'That is not a valid wallet address.'; end if;
  if v_net is null then raise exception 'This network is not supported yet.'; end if;
  if (select count(*) from public.wallet_challenges where user_id = v_uid and created_at > v_now - interval '1 hour') >= 10 then
    raise exception 'Too many verification attempts. Please wait a while and try again.';
  end if;
  v_msg := 'Tarafab.XAi wallet ownership verification' || E'\n\n'
    || 'Sign this message to prove you control this wallet. Signing is free: it does not send a transaction, move funds or grant any permission.' || E'\n\n'
    || 'Address: ' || v_addr || E'\n'
    || 'Network: ' || v_net || ' (chain ' || p_chain_id || ')' || E'\n'
    || 'Account: ' || v_uid || E'\n'
    || 'Nonce: ' || v_nonce || E'\n'
    || 'Issued: ' || to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || E'\n'
    || 'Expires: ' || to_char((v_now + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  insert into public.wallet_challenges (user_id, address, chain_id, message, expires_at)
  values (v_uid, v_addr, p_chain_id, v_msg, v_now + interval '10 minutes')
  returning id into v_id;
  return jsonb_build_object('challenge_id', v_id, 'message', v_msg, 'expires_at', v_now + interval '10 minutes');
end $$;

-- Step 2 (server only): called by the wallet-verify Edge Function after it
-- has checked the signature. Not executable by clients, so a link can never
-- be recorded without a verified signature.
create or replace function public.wallet_record_verified(p_user uuid, p_challenge uuid, p_address text, p_label text, p_wallet_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.wallet_challenges%rowtype;
  v_addr text := lower(trim(coalesce(p_address, '')));
  w public.client_wallets%rowtype;
  v_now timestamptz := now();
  v_net text;
begin
  select * into c from public.wallet_challenges where id = p_challenge for update;
  if not found or c.user_id <> p_user then raise exception 'This verification request was not found. Start again.'; end if;
  if c.used_at is not null then raise exception 'This verification request was already used. Start again.'; end if;
  if c.expires_at < v_now then raise exception 'This verification request expired. Start again.'; end if;
  if c.address <> v_addr then raise exception 'The signing wallet does not match the address being verified.'; end if;
  update public.wallet_challenges set used_at = v_now where id = c.id;
  v_net := public._wallet_networks() ->> c.chain_id::text;

  select * into w from public.client_wallets where chain = 'evm' and address = v_addr and status = 'linked' for update;
  if found and w.user_id <> p_user then
    perform public._wallet_audit(p_user, null, 'WALLET_LINK_REJECTED', 'rejected',
      jsonb_build_object('address', v_addr, 'chain_id', c.chain_id, 'reason', 'linked_to_another_account'));
    -- Returned, not raised, so the challenge stays used and the audit entry is kept.
    return jsonb_build_object('error', 'This wallet is already linked to another Tarafab.XAi account.', 'code', 'linked_elsewhere');
  end if;

  if found then
    -- Same client re-verifying an existing link.
    update public.client_wallets
       set last_verified_at = v_now, verification_status = 'verified', chain_id = c.chain_id, network = v_net,
           label = coalesce(nullif(trim(p_label), ''), label), wallet_name = coalesce(nullif(trim(p_wallet_name), ''), wallet_name),
           updated_at = v_now
     where id = w.id returning * into w;
    perform public._wallet_audit(p_user, w.id, 'WALLET_REVERIFIED', 'success',
      jsonb_build_object('address', v_addr, 'chain_id', c.chain_id, 'network', v_net));
    return jsonb_build_object('wallet_id', w.id, 'status', 'reverified');
  end if;

  if (select count(*) from public.client_wallets where user_id = p_user and status = 'linked') >= 10 then
    raise exception 'You can link up to 10 wallets. Disconnect one first.';
  end if;

  insert into public.client_wallets (user_id, chain, chain_id, network, address, label, wallet_name, verified_at, last_verified_at)
  values (p_user, 'evm', c.chain_id, v_net, v_addr, left(coalesce(trim(p_label), ''), 60), left(coalesce(trim(p_wallet_name), ''), 60), v_now, v_now)
  returning * into w;
  perform public._wallet_audit(p_user, w.id, 'WALLET_LINKED', 'success',
    jsonb_build_object('address', v_addr, 'chain_id', c.chain_id, 'network', v_net, 'wallet_name', w.wallet_name));
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target)
  values (p_user, 'security', 'Wallet linked and verified',
          'Your ' || v_net || ' wallet ' || left(v_addr, 6) || '…' || right(v_addr, 4) || ' was linked after you signed the ownership message. If this was not you, contact support.',
          'Open wallet', '#wallet');
  return jsonb_build_object('wallet_id', w.id, 'status', 'linked');
end $$;

-- Audit helper for wallet events (actor may be a client or an admin, or the
-- verification service acting for the client).
create or replace function public._wallet_audit(p_actor uuid, p_wallet uuid, p_action text, p_result text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details, result)
  select p_actor, p_actor,
         coalesce((select user_id from public.client_wallets where id = p_wallet), p_actor),
         p_action, 'wallet', p_wallet::text, coalesce(p_details, '{}'::jsonb), p_result
$$;

-- Client disconnects one of their own wallets. History is kept.
create or replace function public.client_unlink_wallet(p_wallet uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.client_wallets%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into w from public.client_wallets where id = p_wallet and user_id = auth.uid() for update;
  if not found then raise exception 'Wallet not found.'; end if;
  if w.status <> 'linked' then return jsonb_build_object('wallet_id', w.id, 'status', w.status); end if;
  update public.client_wallets set status = 'unlinked', ended_at = now(), ended_by = auth.uid(), end_reason = 'Disconnected by client', updated_at = now()
   where id = w.id;
  perform public._wallet_audit(auth.uid(), w.id, 'WALLET_UNLINKED', 'success',
    jsonb_build_object('address', w.address, 'chain_id', w.chain_id, 'previous_status', 'linked', 'new_status', 'unlinked'));
  return jsonb_build_object('wallet_id', w.id, 'status', 'unlinked');
end $$;

-- Admin: paged list with search (client name/email/address) and filters.
create or replace function public.admin_list_wallets(p_search text default null, p_status text default null, p_chain_id integer default null, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, user_id uuid, full_name text, email text, chain_id integer, network text, address text, label text, wallet_name text,
               status text, verification_status text, linked_at timestamptz, verified_at timestamptz, last_verified_at timestamptz,
               ended_at timestamptz, end_reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_search, '')));
begin
  perform public._require_admin();
  return query
    select w.id, w.user_id, p.full_name, u.email::text, w.chain_id, w.network, w.address, w.label, w.wallet_name,
           w.status, w.verification_status, w.linked_at, w.verified_at, w.last_verified_at, w.ended_at, w.end_reason, w.created_at
      from public.client_wallets w
      left join public.profiles p on p.id = w.user_id
      left join auth.users u on u.id = w.user_id
     where (p_status is null or w.status = p_status)
       and (p_chain_id is null or w.chain_id = p_chain_id)
       and (p_before is null or w.created_at < p_before)
       and (q = '' or w.address like '%' || q || '%' or lower(coalesce(p.full_name, '')) like '%' || q || '%'
            or lower(coalesce(u.email::text, '')) like '%' || q || '%' or w.user_id::text = q)
     order by w.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Admin: revoke a live link. Audited with previous and new state, and the
-- client is notified. The wallet itself is external and is not affected.
create or replace function public.admin_revoke_wallet(p_wallet uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.client_wallets%rowtype; v_reason text := trim(coalesce(p_reason, ''));
begin
  perform public._require_admin();
  if char_length(v_reason) < 3 then raise exception 'Enter a reason for revoking this wallet link.'; end if;
  select * into w from public.client_wallets where id = p_wallet for update;
  if not found then raise exception 'Wallet not found.'; end if;
  if w.status <> 'linked' then raise exception 'This wallet link is already %.', w.status; end if;
  update public.client_wallets set status = 'revoked', ended_at = now(), ended_by = auth.uid(), end_reason = left(v_reason, 500), updated_at = now()
   where id = w.id;
  perform public._wallet_audit(auth.uid(), w.id, 'ADMIN_WALLET_REVOKED', 'success',
    jsonb_build_object('address', w.address, 'chain_id', w.chain_id, 'client_id', w.user_id,
                       'previous_status', 'linked', 'new_status', 'revoked', 'reason', left(v_reason, 500)));
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by)
  values (w.user_id, 'security', 'Wallet link removed',
          'The link to your ' || w.network || ' wallet ' || left(w.address, 6) || '…' || right(w.address, 4) || ' was removed by our team. Reason: ' || left(v_reason, 300),
          'Open wallet', '#wallet', auth.uid());
  return jsonb_build_object('wallet_id', w.id, 'status', 'revoked');
end $$;

-- Admin: the audit trail for one wallet (or every wallet of one client).
create or replace function public.admin_wallet_events(p_wallet uuid)
returns table (id uuid, action text, result text, actor_id uuid, actor_name text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select a.id, a.action, a.result, a.actor_id, p.full_name, a.details, a.created_at
      from public.audit_logs a left join public.profiles p on p.id = a.actor_id
     where a.entity = 'wallet' and a.entity_id = p_wallet::text
     order by a.created_at desc limit 200;
end $$;

-- Execute rights: clients get their two functions; admins theirs (each checks
-- is_admin); wallet_record_verified and the helpers only for service_role.
revoke all on function public.client_wallet_challenge(text, integer) from public, anon;
revoke all on function public.client_unlink_wallet(uuid) from public, anon;
revoke all on function public.admin_list_wallets(text, text, integer, timestamptz, integer) from public, anon;
revoke all on function public.admin_revoke_wallet(uuid, text) from public, anon;
revoke all on function public.admin_wallet_events(uuid) from public, anon;
revoke all on function public.wallet_record_verified(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._wallet_audit(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.client_wallet_challenge(text, integer) to authenticated;
grant execute on function public.client_unlink_wallet(uuid) to authenticated;
grant execute on function public.admin_list_wallets(text, text, integer, timestamptz, integer) to authenticated;
grant execute on function public.admin_revoke_wallet(uuid, text) to authenticated;
grant execute on function public.admin_wallet_events(uuid) to authenticated;
grant execute on function public.wallet_record_verified(uuid, uuid, text, text, text) to service_role;
grant execute on function public._wallet_audit(uuid, uuid, text, text, jsonb) to service_role;

-- The client menu gains an admin-hideable 'wallet' section.
create or replace function public._client_nav_optional()
returns text[] language sql immutable set search_path = public as $$
  select array['portfolio', 'markets', 'marketActivity', 'priceHistory', 'transactions', 'performance',
               'deposit', 'withdraw', 'depositHistory', 'withdrawalHistory', 'notifications', 'support', 'wallet']
$$;

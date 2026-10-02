-- SeerBit payment links, Nigeria-only payment gateway, payment records and
-- pricing fields. Additive: existing plans, subscriptions and all other data
-- are untouched. Applied in parts 20261025000101 / …0102 (no DROP statements).

-- Pricing fields on the existing plans table.
alter table public.premium_plans add column if not exists tier text not null default 'premium' check (tier in ('standard', 'premium', 'pro'));
alter table public.premium_plans add column if not exists billing_period text check (billing_period in ('month', 'quarter', 'year'));
alter table public.premium_plans add column if not exists description text not null default '';
alter table public.premium_plans add column if not exists features text[] not null default '{}';
alter table public.premium_plans add column if not exists highlighted boolean not null default false;
-- anon cannot evaluate is_admin(): separate read policies.
alter policy premium_plans_read on public.premium_plans to authenticated using (enabled or public.is_admin());
create policy premium_plans_public on public.premium_plans for select to anon using (enabled);

-- Payment links: readable by admins only (customers get a URL only from the gateway).
create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  provider text not null default 'seerbit' check (provider in ('seerbit')),
  url text not null check (url ~ '^https://pay\.seerbitapi\.com/[A-Za-z0-9_-]+$'),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  frequency text not null default 'one_time' check (frequency in ('one_time', 'recurring')),
  usage text not null default 'single_use' check (usage in ('single_use', 'multiple_use')),
  allowed_country text not null default 'NG' check (allowed_country ~ '^[A-Z]{2}$'),
  enabled boolean not null default true,
  plan_id text references public.premium_plans(id),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_links enable row level security;
create policy payment_links_admin on public.payment_links for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.payment_links from anon, authenticated;
insert into public.payment_links (title, url, amount, currency, frequency, usage, allowed_country, enabled)
select 'Terafab', 'https://pay.seerbitapi.com/77871914', 4000, 'NGN', 'one_time', 'single_use', 'NG', true
where not exists (select 1 from public.payment_links where url = 'https://pay.seerbitapi.com/77871914');

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PAY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  user_id uuid not null references auth.users(id),
  payment_link_id uuid not null references public.payment_links(id),
  plan_id text references public.premium_plans(id),
  expected_amount numeric(14,2) not null,
  currency text not null,
  status text not null default 'redirected' check (status in ('redirected', 'pending_verification', 'successful', 'failed', 'cancelled', 'expired')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'provider_verified', 'provider_failed', 'admin_confirmed', 'admin_rejected')),
  provider_reference text,
  country text,
  idempotency_key text,
  verified_at timestamptz,
  verified_by uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_attempts_user_idem on public.payment_attempts (user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists payment_attempts_provider_ref on public.payment_attempts (provider_reference) where provider_reference is not null;
create index if not exists payment_attempts_user on public.payment_attempts (user_id, created_at desc);
alter table public.payment_attempts enable row level security;
create policy payment_attempts_own on public.payment_attempts for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.payment_attempts from anon, authenticated;

create table if not exists public.payment_gateway_state (id int primary key default 1 check (id = 1), key_hash text, updated_at timestamptz not null default now());
insert into public.payment_gateway_state (id) values (1) on conflict do nothing;
alter table public.payment_gateway_state enable row level security;
revoke all on public.payment_gateway_state from anon, authenticated;

create or replace function public._payments_expire()
returns void language sql security definer set search_path = public as $$
  update public.payment_attempts set status = 'expired', updated_at = now()
   where status = 'redirected' and created_at < now() - interval '24 hours'
$$;
revoke all on function public._payments_expire() from public, anon, authenticated;

-- Issues the payment destination. Only the app's server can call it usefully
-- (gateway key, kept in a server environment variable); the country comes
-- from the hosting platform's IP geolocation header read by that server.
create or replace function public.gateway_start_payment(p_key text, p_plan text, p_country text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_hash text; pl public.premium_plans; lk public.payment_links; a public.payment_attempts;
        v_key text := public._check_idempotency_key(p_idempotency_key); v_country text := upper(coalesce(nullif(trim(p_country), ''), ''));
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select key_hash into v_hash from public.payment_gateway_state where id = 1;
  if v_hash is null or p_key is null or length(p_key) < 32 or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> v_hash then
    return jsonb_build_object('status', 'unavailable');
  end if;
  perform public._payments_expire();
  if public.feature_state('premium') not in ('enabled', 'premium') then return jsonb_build_object('status', 'disabled'); end if;
  select * into pl from public.premium_plans where id = p_plan and enabled;
  if not found then raise exception 'This plan is not available.'; end if;
  select * into lk from public.payment_links where plan_id = pl.id order by enabled desc, created_at desc limit 1;
  if not found or not lk.enabled then return jsonb_build_object('status', 'disabled'); end if;
  -- The amount and currency are the plan's, checked against the link: the
  -- browser never chooses them.
  if lk.amount <> coalesce(pl.promo_price, pl.price) or lk.currency <> pl.currency then return jsonb_build_object('status', 'disabled'); end if;
  if v_country !~ '^[A-Z]{2}$' then return jsonb_build_object('status', 'unknown_region'); end if;
  if v_country <> lk.allowed_country then return jsonb_build_object('status', 'region_blocked'); end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then raise exception 'Your account is suspended. Contact support.'; end if;
  if v_key is not null then
    select * into a from public.payment_attempts where user_id = v_uid and idempotency_key = v_key;
    if found then return jsonb_build_object('status', 'ok', 'url', lk.url, 'reference', a.reference, 'amount', a.expected_amount, 'currency', a.currency); end if;
  end if;
  if (select count(*) from public.payment_attempts where user_id = v_uid and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Too many payment attempts. Please wait a few minutes and try again.';
  end if;
  insert into public.payment_attempts (user_id, payment_link_id, plan_id, expected_amount, currency, country, idempotency_key)
  values (v_uid, lk.id, pl.id, lk.amount, lk.currency, v_country, v_key) returning * into a;
  return jsonb_build_object('status', 'ok', 'url', lk.url, 'reference', a.reference, 'amount', a.expected_amount, 'currency', a.currency);
end $$;
revoke all on function public.gateway_start_payment(text, text, text, text) from public, anon;
grant execute on function public.gateway_start_payment(text, text, text, text) to authenticated;

-- Back from the payment page: records what the user reports. Never "paid".
create or replace function public.client_payment_returned(p_reference text, p_provider_reference text, p_outcome text)
returns public.payment_attempts language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts; v_ref text := nullif(trim(coalesce(p_provider_reference, '')), '');
begin
  select * into a from public.payment_attempts where reference = p_reference and user_id = auth.uid() for update;
  if not found then raise exception 'Payment not found.'; end if;
  if a.status not in ('redirected', 'pending_verification') then return a; end if;
  if v_ref is not null and v_ref !~ '^[A-Za-z0-9_-]{4,80}$' then v_ref := null; end if;
  if p_outcome = 'cancelled' then
    update public.payment_attempts set status = 'cancelled', updated_at = now() where id = a.id returning * into a;
  else
    begin
      update public.payment_attempts set status = 'pending_verification', provider_reference = coalesce(v_ref, provider_reference), updated_at = now() where id = a.id returning * into a;
    exception when unique_violation then
      update public.payment_attempts set status = 'pending_verification', updated_at = now() where id = a.id returning * into a;
    end;
  end if;
  return a;
end $$;
revoke all on function public.client_payment_returned(text, text, text) from public, anon;
grant execute on function public.client_payment_returned(text, text, text) to authenticated;

-- Premium access from a verified payment (idempotent per payment reference).
create or replace function public._payment_activate(p_id uuid, p_source text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts; pl public.premium_plans; s public.subscriptions; v_start timestamptz; v_period interval;
begin
  select * into a from public.payment_attempts where id = p_id;
  select * into pl from public.premium_plans where id = a.plan_id;
  if pl.id is null then return; end if;
  begin
    insert into public.subscription_events (user_id, source, event_type, provider_event_id, details)
    values (a.user_id, p_source, 'seerbit_payment', 'seerbit:' || a.reference, jsonb_build_object('reference', a.reference, 'amount', a.expected_amount, 'currency', a.currency, 'note', p_note));
  exception when unique_violation then return; end;
  v_period := case coalesce(pl.billing_period, pl.billing_interval) when 'year' then interval '1 year' when 'quarter' then interval '3 months' else interval '1 month' end;
  select * into s from public.subscriptions where user_id = a.user_id for update;
  v_start := greatest(now(), coalesce(case when s.status in ('active', 'trial') then s.current_period_end end, now()));
  insert into public.subscriptions (user_id, plan_id, status, source, provider, provider_customer_id, current_period_start, current_period_end, override_reason)
  values (a.user_id, pl.id, 'active', p_source, 'seerbit', null, now(), v_start + v_period, case when p_source = 'admin_override' then p_note end)
  on conflict (user_id) do update set plan_id = pl.id, status = 'active', source = p_source, provider = 'seerbit',
     current_period_start = now(), current_period_end = v_start + v_period, cancel_at_period_end = false, cancelled_at = null,
     override_reason = case when p_source = 'admin_override' then p_note end, updated_at = now();
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target)
  values (a.user_id, 'account', 'Payment confirmed', 'Your payment ' || a.reference || ' was confirmed. Tarafab Premium is active.', 'View Premium', '#premium');
end $$;
revoke all on function public._payment_activate(uuid, text, text) from public, anon, authenticated;

-- Provider verification result (service role only: seerbit-verify).
create or replace function public.engine_payment_verified(p_reference text, p_success boolean, p_provider_reference text, p_amount numeric, p_currency text, p_detail text)
returns text language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts;
begin
  select * into a from public.payment_attempts where reference = p_reference for update;
  if not found then return 'not_found'; end if;
  if a.status = 'successful' then return 'already'; end if;
  if p_success and p_amount = a.expected_amount and upper(p_currency) = a.currency then
    update public.payment_attempts set status = 'successful', verification_status = 'provider_verified', provider_reference = coalesce(p_provider_reference, provider_reference),
           verified_at = now(), note = left(p_detail, 300), updated_at = now() where id = a.id;
    perform public._payment_activate(a.id, 'payment', 'Verified with SeerBit');
    return 'successful';
  end if;
  update public.payment_attempts set status = 'failed', verification_status = 'provider_failed',
         note = left(coalesce(p_detail, '') || case when p_success then ' (amount or currency did not match)' else '' end, 300), updated_at = now() where id = a.id;
  return 'failed';
end $$;
revoke all on function public.engine_payment_verified(text, boolean, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.engine_payment_verified(text, boolean, text, numeric, text, text) to service_role;

create or replace function public.admin_upsert_payment_link(p_id uuid, p_title text, p_url text, p_amount numeric, p_currency text, p_frequency text, p_usage text,
  p_allowed_country text, p_enabled boolean, p_plan_id text, p_reason text)
returns public.payment_links language plpgsql security definer set search_path = public as $$
declare r public.payment_links; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if trim(coalesce(p_url, '')) !~ '^https://pay\.seerbitapi\.com/[A-Za-z0-9_-]+$' then raise exception 'Enter a SeerBit payment link (https://pay.seerbitapi.com/…).'; end if;
  if p_id is null then
    insert into public.payment_links (title, url, amount, currency, frequency, usage, allowed_country, enabled, plan_id, updated_by)
    values (trim(p_title), trim(p_url), p_amount, upper(p_currency), p_frequency, p_usage, upper(p_allowed_country), coalesce(p_enabled, false), nullif(p_plan_id, ''), auth.uid())
    returning * into r;
  else
    select to_jsonb(l) into old from public.payment_links l where id = p_id for update;
    if old is null then raise exception 'Payment link not found.'; end if;
    update public.payment_links set title = trim(p_title), url = trim(p_url), amount = p_amount, currency = upper(p_currency), frequency = p_frequency, usage = p_usage,
           allowed_country = upper(p_allowed_country), enabled = coalesce(p_enabled, false), plan_id = nullif(p_plan_id, ''), updated_by = auth.uid(), updated_at = now()
     where id = p_id returning * into r;
  end if;
  perform public._audit('payment_link_saved', null, 'payment_link', r.id::text, jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_upsert_payment_link(uuid, text, text, numeric, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.admin_upsert_payment_link(uuid, text, text, numeric, text, text, text, text, boolean, text, text) to authenticated;

create or replace function public.admin_set_payment_link_enabled(p_id uuid, p_enabled boolean, p_reason text)
returns public.payment_links language plpgsql security definer set search_path = public as $$
declare r public.payment_links;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  update public.payment_links set enabled = p_enabled, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into r;
  if not found then raise exception 'Payment link not found.'; end if;
  perform public._audit(case when p_enabled then 'payment_link_enabled' else 'payment_link_disabled' end, null, 'payment_link', p_id::text, jsonb_build_object('reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_set_payment_link_enabled(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_payment_link_enabled(uuid, boolean, text) to authenticated;

create or replace function public.admin_set_payment_gateway_key(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_key is null or length(p_key) < 32 then raise exception 'Use a random key of at least 32 characters.'; end if;
  update public.payment_gateway_state set key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), updated_at = now() where id = 1;
  perform public._audit('payment_gateway_key_set', null, 'payment_gateway', '1', '{}'::jsonb);
  return true;
end $$;
revoke all on function public.admin_set_payment_gateway_key(text) from public, anon;
grant execute on function public.admin_set_payment_gateway_key(text) to authenticated;

create or replace function public.admin_payment_gateway_configured()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return (select jsonb_build_object('configured', key_hash is not null, 'updated_at', updated_at) from public.payment_gateway_state where id = 1);
end $$;
revoke all on function public.admin_payment_gateway_configured() from public, anon;
grant execute on function public.admin_payment_gateway_configured() to authenticated;

create or replace function public.admin_list_payment_attempts(p_status text default null, p_limit integer default 200)
returns table (id uuid, reference text, user_id uuid, full_name text, email text, plan_id text, expected_amount numeric, currency text, status text,
  verification_status text, provider_reference text, country text, note text, created_at timestamptz, verified_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  perform public._payments_expire();
  return query
  select a.id, a.reference, a.user_id, p.full_name, u.email::text, a.plan_id, a.expected_amount, a.currency, a.status, a.verification_status,
         a.provider_reference, a.country, a.note, a.created_at, a.verified_at
    from public.payment_attempts a left join public.profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id
   where p_status is null or a.status = p_status order by a.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;
revoke all on function public.admin_list_payment_attempts(text, integer) from public, anon;
grant execute on function public.admin_list_payment_attempts(text, integer) to authenticated;

-- When SeerBit shows the payment but automatic verification is unavailable:
-- an audited admin decision, labelled as such everywhere.
create or replace function public.admin_payment_decide(p_reference text, p_action text, p_provider_reference text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into a from public.payment_attempts where reference = p_reference for update;
  if not found then raise exception 'Payment not found.'; end if;
  if a.status = 'successful' then raise exception 'This payment is already successful.'; end if;
  if p_action = 'confirm' then
    update public.payment_attempts set status = 'successful', verification_status = 'admin_confirmed', provider_reference = coalesce(nullif(trim(p_provider_reference), ''), provider_reference),
           verified_at = now(), verified_by = auth.uid(), note = left(trim(p_reason), 300), updated_at = now() where id = a.id;
    perform public._payment_activate(a.id, 'admin_override', 'SeerBit payment ' || coalesce(nullif(trim(p_provider_reference), ''), a.reference) || ' confirmed by admin: ' || trim(p_reason));
  elsif p_action = 'reject' then
    update public.payment_attempts set status = 'failed', verification_status = 'admin_rejected', verified_by = auth.uid(), note = left(trim(p_reason), 300), updated_at = now() where id = a.id;
  else raise exception 'Unknown action.';
  end if;
  perform public._audit('payment_' || p_action, a.user_id, 'payment_attempt', a.id::text, jsonb_build_object('reference', a.reference, 'provider_reference', p_provider_reference, 'reason', trim(p_reason)));
  return p_action;
end $$;
revoke all on function public.admin_payment_decide(text, text, text, text) from public, anon;
grant execute on function public.admin_payment_decide(text, text, text, text) to authenticated;

create or replace function public.admin_upsert_plan_v2(p_id text, p_name text, p_interval text, p_period text, p_tier text, p_price numeric, p_currency text,
  p_promo_price numeric, p_promo_label text, p_provider_price_id text, p_description text, p_features text[], p_highlighted boolean, p_enabled boolean, p_sort integer, p_reason text)
returns public.premium_plans language plpgsql security definer set search_path = public as $$
declare r public.premium_plans;
begin
  r := public.admin_upsert_plan(p_id, p_name, p_interval, p_price, p_currency, p_promo_price, p_promo_label, p_provider_price_id, p_enabled, p_sort, p_reason);
  update public.premium_plans set billing_period = coalesce(p_period, p_interval), tier = coalesce(p_tier, 'premium'), description = left(coalesce(p_description, ''), 300),
         features = coalesce((select array_agg(left(trim(f), 120)) from unnest(p_features) f where trim(f) <> ''), '{}'), highlighted = coalesce(p_highlighted, false), updated_at = now()
   where id = r.id returning * into r;
  return r;
end $$;
revoke all on function public.admin_upsert_plan_v2(text, text, text, text, text, numeric, text, numeric, text, text, text, text[], boolean, boolean, integer, text) from public, anon;
grant execute on function public.admin_upsert_plan_v2(text, text, text, text, text, numeric, text, numeric, text, text, text, text[], boolean, boolean, integer, text) to authenticated;
-- client_premium_info() was also replaced (same signature) to add the pricing
-- fields, "seerbit" availability per plan (never the URL) and recent payments.

-- Paystack payments (Nigeria only). Additive: no existing rows are changed or removed.
-- Amounts/currency come from premium_plans; the server re-verifies every result with the
-- Paystack API before calling gateway_paystack_result (gateway key required).

alter table public.payment_attempts alter column payment_link_id drop not null;
alter table public.payment_attempts add column if not exists provider text not null default 'seerbit';
alter table public.payment_attempts add column if not exists customer_email text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_attempts_provider_check') then
    alter table public.payment_attempts add constraint payment_attempts_provider_check check (provider in ('seerbit', 'paystack'));
  end if;
end $$;
alter table public.premium_plans add column if not exists paystack_enabled boolean not null default false;

create or replace function public._gateway_key_ok(p_key text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select p_key is not null and length(p_key) >= 32 and exists (select 1 from public.payment_gateway_state where id = 1 and key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'))
$function$;

create or replace function public.gateway_start_paystack(p_key text, p_plan text, p_country text, p_idempotency_key text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); pl public.premium_plans; a public.payment_attempts; v_email text;
        v_key text := public._check_idempotency_key(p_idempotency_key); v_country text := upper(coalesce(nullif(trim(p_country), ''), ''));
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if not public._gateway_key_ok(p_key) then return jsonb_build_object('status', 'unavailable'); end if;
  perform public._payments_expire();
  if public.feature_state('premium') not in ('enabled', 'premium') then return jsonb_build_object('status', 'disabled'); end if;
  select * into pl from public.premium_plans where id = p_plan and enabled;
  if not found then raise exception 'This plan is not available.'; end if;
  if not pl.paystack_enabled then return jsonb_build_object('status', 'disabled'); end if;
  if v_country !~ '^[A-Z]{2}$' then return jsonb_build_object('status', 'unknown_region'); end if;
  if v_country <> 'NG' then return jsonb_build_object('status', 'region_blocked'); end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then raise exception 'Your account is suspended. Contact support.'; end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'Your account has no email address for the payment receipt.'; end if;
  if v_key is not null then
    select * into a from public.payment_attempts where user_id = v_uid and idempotency_key = v_key;
    if found and a.status = 'redirected' then
      return jsonb_build_object('status', 'ok', 'reference', a.reference, 'amount', a.expected_amount, 'currency', a.currency, 'email', v_email, 'plan_id', pl.id, 'plan_name', pl.name, 'existing', true);
    end if;
  end if;
  if (select count(*) from public.payment_attempts where user_id = v_uid and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Too many payment attempts. Please wait a few minutes and try again.';
  end if;
  insert into public.payment_attempts (user_id, provider, plan_id, expected_amount, currency, country, idempotency_key, customer_email)
  values (v_uid, 'paystack', pl.id, coalesce(pl.promo_price, pl.price), pl.currency, v_country, v_key, v_email) returning * into a;
  return jsonb_build_object('status', 'ok', 'reference', a.reference, 'amount', a.expected_amount, 'currency', a.currency, 'email', v_email, 'plan_id', pl.id, 'plan_name', pl.name, 'existing', false);
end $function$;

create or replace function public.gateway_paystack_result(p_key text, p_reference text, p_status text, p_amount_minor bigint, p_currency text, p_provider_id text, p_detail text)
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare a public.payment_attempts;
begin
  if not public._gateway_key_ok(p_key) then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into a from public.payment_attempts where reference = p_reference and provider = 'paystack' for update;
  if not found then return 'not_found'; end if;
  if a.status = 'successful' then
    if p_status = 'reversed' then
      perform public._audit('paystack_payment_reversed', a.user_id, 'payment_attempt', a.id::text, jsonb_build_object('reference', a.reference, 'detail', left(p_detail, 200)));
      update public.payment_attempts set note = left('Reversed at Paystack: ' || coalesce(p_detail, ''), 300), updated_at = now() where id = a.id;
      return 'reversed_flagged';
    end if;
    return 'already';
  end if;
  if p_status = 'success' then
    if p_amount_minor = round(a.expected_amount * 100) and upper(p_currency) = a.currency then
      update public.payment_attempts set status = 'successful', verification_status = 'provider_verified', provider_reference = coalesce(nullif(p_provider_id, ''), provider_reference),
             verified_at = now(), note = left(coalesce(p_detail, ''), 300), updated_at = now() where id = a.id;
      perform public._payment_activate(a.id, 'payment', 'Verified with Paystack');
      return 'successful';
    end if;
    update public.payment_attempts set status = 'failed', verification_status = 'provider_failed',
           note = left('Paid amount or currency did not match (' || p_amount_minor || ' ' || coalesce(p_currency, '') || ')', 300), updated_at = now() where id = a.id;
    perform public._audit('paystack_amount_mismatch', a.user_id, 'payment_attempt', a.id::text, jsonb_build_object('reference', a.reference, 'amount_minor', p_amount_minor, 'currency', p_currency));
    return 'mismatch';
  end if;
  if p_status in ('failed', 'init_failed') then
    update public.payment_attempts set status = 'failed', verification_status = case when p_status = 'failed' then 'provider_failed' else verification_status end,
           note = left(coalesce(p_detail, ''), 300), updated_at = now() where id = a.id and status in ('redirected', 'pending_verification');
    return 'failed';
  end if;
  if p_status = 'abandoned' then
    update public.payment_attempts set status = case when created_at < now() - interval '24 hours' then 'expired' else 'pending_verification' end,
           note = 'Not completed at Paystack yet', updated_at = now() where id = a.id and status in ('redirected', 'pending_verification');
    return 'pending';
  end if;
  update public.payment_attempts set status = 'pending_verification', updated_at = now() where id = a.id and status = 'redirected';
  return 'pending';
end $function$;

create or replace function public.admin_set_plan_paystack(p_plan text, p_enabled boolean, p_reason text)
 returns public.premium_plans language plpgsql security definer set search_path to 'public'
as $function$
declare r public.premium_plans;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  update public.premium_plans set paystack_enabled = coalesce(p_enabled, false), updated_by = auth.uid(), updated_at = now() where id = p_plan returning * into r;
  if not found then raise exception 'Plan not found.'; end if;
  perform public._audit('plan_paystack_' || case when p_enabled then 'enabled' else 'disabled' end, null, 'premium_plan', p_plan, jsonb_build_object('reason', trim(p_reason)));
  return r;
end $function$;

create or replace function public.admin_list_payment_attempts_v2(p_status text default null, p_limit integer default 200)
 returns table(id uuid, reference text, provider text, user_id uuid, full_name text, email text, plan_id text, expected_amount numeric, currency text, status text, verification_status text, provider_reference text, country text, note text, created_at timestamptz, verified_at timestamptz)
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform public._require_admin();
  perform public._payments_expire();
  return query
  select a.id, a.reference, a.provider, a.user_id, p.full_name, u.email::text, a.plan_id, a.expected_amount, a.currency, a.status, a.verification_status,
         a.provider_reference, a.country, a.note, a.created_at, a.verified_at
    from public.payment_attempts a left join public.profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id
   where p_status is null or a.status = p_status order by a.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $function$;

create or replace function public.client_premium_info()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); s public.subscriptions; st public.premium_settings; v_status text; v_prem boolean;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into st from public.premium_settings where id = 1;
  select * into s from public.subscriptions where user_id = v_uid;
  v_status := public._premium_status(v_uid);
  v_prem := v_status = 'premium';
  return jsonb_build_object(
    'status', v_status, 'premium', v_prem,
    'subscription', case when s.id is null then null else jsonb_build_object('plan_id', s.plan_id, 'status', s.status, 'source', s.source, 'provider', s.provider,
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
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'interval', p.billing_interval, 'period', coalesce(p.billing_period, p.billing_interval),
        'tier', p.tier, 'description', p.description, 'features', to_jsonb(p.features), 'highlighted', p.highlighted, 'price', p.price,
        'currency', p.currency, 'promo_price', p.promo_price, 'promo_label', p.promo_label, 'checkout', p.provider_price_id is not null,
        'paystack', p.paystack_enabled,
        'seerbit', exists (select 1 from public.payment_links l where l.plan_id = p.id and l.enabled),
        'seerbit_country', (select l.allowed_country from public.payment_links l where l.plan_id = p.id and l.enabled limit 1))
        order by p.sort_order, p.price) from public.premium_plans p where p.enabled), '[]'::jsonb),
    'payments_recent', coalesce((select jsonb_agg(jsonb_build_object('reference', a.reference, 'plan_id', a.plan_id, 'amount', a.expected_amount, 'currency', a.currency,
        'status', a.status, 'verification_status', a.verification_status, 'provider', a.provider, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.payment_attempts where user_id = v_uid order by created_at desc limit 5) a), '[]'::jsonb));
end $function$;

revoke all on function public._gateway_key_ok(text) from public, anon, authenticated;
revoke all on function public.gateway_start_paystack(text, text, text, text) from public, anon;
grant execute on function public.gateway_start_paystack(text, text, text, text) to authenticated;
-- Called by the webhook/return routes; guarded by the gateway key (only its hash is stored).
revoke all on function public.gateway_paystack_result(text, text, text, bigint, text, text, text) from public;
grant execute on function public.gateway_paystack_result(text, text, text, bigint, text, text, text) to anon, authenticated;
revoke all on function public.admin_set_plan_paystack(text, boolean, text) from public, anon;
grant execute on function public.admin_set_plan_paystack(text, boolean, text) to authenticated;
revoke all on function public.admin_list_payment_attempts_v2(text, integer) from public, anon;
grant execute on function public.admin_list_payment_attempts_v2(text, integer) to authenticated;

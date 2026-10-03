-- Client display in USD; Nigeria SeerBit checkout stays NGN.
-- Clients are shown the USD plans. Buying one resolves, server-side and only
-- after the Nigeria check, to the NGN plan with the same tier and period and
-- its existing SeerBit link. Payment records keep the NGN amount/currency.
-- No data is changed.

create or replace function public.gateway_start_payment(p_key text, p_plan text, p_country text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_hash text; pl public.premium_plans; lk public.payment_links; a public.payment_attempts;
        v_key text := public._check_idempotency_key(p_idempotency_key); v_country text := upper(coalesce(nullif(trim(p_country), ''), ''));
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select key_hash into v_hash from public.payment_gateway_state where id = 1;
  if v_hash is not null and (p_key is null or length(p_key) < 32 or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> v_hash) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  perform public._payments_expire();
  if public.feature_state('premium') not in ('enabled', 'premium') then return jsonb_build_object('status', 'disabled'); end if;
  select * into pl from public.premium_plans where id = p_plan and enabled;
  if not found then raise exception 'This plan is not available.'; end if;
  -- A display (USD) plan has no link of its own: checkout uses the enabled
  -- plan with the same tier and period that has an active SeerBit link
  -- (the Nigeria NGN plan). Amount and currency come from that plan.
  if not exists (select 1 from public.payment_links where plan_id = pl.id) then
    select p2.* into pl from public.premium_plans p2
     where p2.enabled and p2.id <> pl.id and p2.tier is not distinct from pl.tier
       and coalesce(p2.billing_period, p2.billing_interval) = coalesce(pl.billing_period, pl.billing_interval)
       and exists (select 1 from public.payment_links l where l.plan_id = p2.id and l.enabled)
     order by p2.sort_order limit 1;
    if not found then return jsonb_build_object('status', 'disabled'); end if;
  end if;
  select * into lk from public.payment_links where plan_id = pl.id order by enabled desc, created_at desc limit 1;
  if not found or not lk.enabled then return jsonb_build_object('status', 'disabled'); end if;
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
        'seerbit', exists (select 1 from public.payment_links l join public.premium_plans q on q.id = l.plan_id
                            where l.enabled and q.enabled and (q.id = p.id or (q.tier is not distinct from p.tier
                              and coalesce(q.billing_period, q.billing_interval) = coalesce(p.billing_period, p.billing_interval)))))
        order by p.sort_order, p.price) from public.premium_plans p where p.enabled
          -- Clients see USD plans; a non-USD plan is listed only when no USD
          -- plan exists for its tier and period.
          and (p.currency = 'USD' or not exists (select 1 from public.premium_plans u where u.enabled and u.currency = 'USD'
                and u.tier is not distinct from p.tier and coalesce(u.billing_period, u.billing_interval) = coalesce(p.billing_period, p.billing_interval)))), '[]'::jsonb),
    'payments_recent', coalesce((select jsonb_agg(jsonb_build_object('reference', a.reference, 'plan_id', a.plan_id, 'amount', a.expected_amount, 'currency', a.currency,
        'status', a.status, 'verification_status', a.verification_status, 'provider', a.provider, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.payment_attempts where user_id = v_uid order by created_at desc limit 5) a), '[]'::jsonb));
end $function$;

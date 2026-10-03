-- Clients see the NGN plans (the billing source of truth); the USD
-- equivalent is computed for display from a live rate (/api/fx). A plan in
-- another currency is listed only when no NGN plan exists for its tier and
-- period. No data is changed.

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
          and (p.currency = 'NGN' or not exists (select 1 from public.premium_plans u where u.enabled and u.currency = 'NGN'
                and u.tier is not distinct from p.tier and coalesce(u.billing_period, u.billing_interval) = coalesce(p.billing_period, p.billing_interval)))), '[]'::jsonb),
    'payments_recent', coalesce((select jsonb_agg(jsonb_build_object('reference', a.reference, 'plan_id', a.plan_id, 'amount', a.expected_amount, 'currency', a.currency,
        'status', a.status, 'verification_status', a.verification_status, 'provider', a.provider, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.payment_attempts where user_id = v_uid order by created_at desc limit 5) a), '[]'::jsonb));
end $function$;

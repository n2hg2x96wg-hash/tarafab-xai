-- SeerBit is the payment provider. Retires the Paystack path added in
-- 202610260001 without removing any data: columns and past rows stay, the
-- Paystack functions can no longer be called, and every plan's Paystack flag
-- is switched off. SeerBit links (payment_links) are not touched.

update public.premium_plans set paystack_enabled = false where paystack_enabled;

revoke all on function public.gateway_start_paystack(text, text, text, text) from public, anon, authenticated;
revoke all on function public.gateway_paystack_result(text, text, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_plan_paystack(text, boolean, text) from public, anon, authenticated;

-- Per-plan SeerBit switch: enables/disables the plan's existing SeerBit
-- payment link(s). Links are never created or regenerated here.
create or replace function public.admin_set_plan_seerbit(p_plan text, p_enabled boolean, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer; pl public.premium_plans;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into pl from public.premium_plans where id = p_plan;
  if not found then raise exception 'Plan not found.'; end if;
  if not exists (select 1 from public.payment_links where plan_id = p_plan) then
    raise exception 'This plan has no SeerBit payment link. Add one under SeerBit payment links first.';
  end if;
  update public.payment_links set enabled = coalesce(p_enabled, false), updated_by = auth.uid(), updated_at = now() where plan_id = p_plan;
  get diagnostics n = row_count;
  perform public._audit('plan_seerbit_' || case when p_enabled then 'enabled' else 'disabled' end, null, 'premium_plan', p_plan,
    jsonb_build_object('reason', trim(p_reason), 'links', n));
  return n;
end $$;
revoke all on function public.admin_set_plan_seerbit(text, boolean, text) from public, anon;
grant execute on function public.admin_set_plan_seerbit(text, boolean, text) to authenticated;

-- Plans no longer report a Paystack flag; SeerBit availability is unchanged.
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
        'seerbit', exists (select 1 from public.payment_links l where l.plan_id = p.id and l.enabled),
        'seerbit_country', (select l.allowed_country from public.payment_links l where l.plan_id = p.id and l.enabled limit 1))
        order by p.sort_order, p.price) from public.premium_plans p where p.enabled), '[]'::jsonb),
    'payments_recent', coalesce((select jsonb_agg(jsonb_build_object('reference', a.reference, 'plan_id', a.plan_id, 'amount', a.expected_amount, 'currency', a.currency,
        'status', a.status, 'verification_status', a.verification_status, 'provider', a.provider, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.payment_attempts where user_id = v_uid order by created_at desc limit 5) a), '[]'::jsonb));
end $function$;

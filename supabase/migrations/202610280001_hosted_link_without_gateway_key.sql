-- Hosted SeerBit links do not need any credential to open. The internal
-- gateway key (PAYMENT_GATEWAY_KEY) is optional hardening: when an admin has
-- saved one, every start must present it; when none is saved, purchases of
-- plans with an active, matching SeerBit link proceed. Plan, amount,
-- currency, link and country are still resolved here, never from the
-- browser, and Premium still activates only after server-side verification.
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

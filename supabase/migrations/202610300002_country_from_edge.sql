-- Nigeria-only checkout: the country is never taken from the browser.
-- Server calls (valid gateway key) pass the hosting platform's IP country;
-- all other calls use Cloudflare's cf-ipcountry, set by Supabase's edge from
-- the caller's IP (a client-sent value is overwritten). Unknown = blocked.

create or replace function public.gateway_start_payment(p_key text, p_plan text, p_country text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_hash text; pl public.premium_plans; lk public.payment_links; a public.payment_attempts;
        v_key text := public._check_idempotency_key(p_idempotency_key); v_country text; v_trusted boolean := false;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select key_hash into v_hash from public.payment_gateway_state where id = 1;
  -- Country source. The app server proves itself with the gateway key and
  -- passes the hosting platform's IP country. Any other caller (the browser
  -- calling this directly) gets the country Cloudflare derived from its own
  -- IP: Supabase's edge overwrites cf-ipcountry, so it cannot be forged, and
  -- p_country is ignored.
  if coalesce(p_key, '') <> '' then
    if v_hash is null or length(p_key) < 32 or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> v_hash then
      return jsonb_build_object('status', 'unavailable');
    end if;
    v_trusted := true;
  end if;
  v_country := upper(coalesce(nullif(trim(case when v_trusted then p_country
                 else (nullif(current_setting('request.headers', true), '')::jsonb)->>'cf-ipcountry' end), ''), ''));
  if v_country in ('XX', 'T1') then v_country := ''; end if;
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

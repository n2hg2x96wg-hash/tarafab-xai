-- Client phone number (profile and administrative contact only).
--
-- No SMS, no OTP, no phone sign-in: the number is never sent anywhere and
-- is never marked as verified. Email verification is unchanged.
--
-- Additive only: two nullable columns. Existing clients keep working with no
-- number ("Not provided" in the admin panel) and can add one in their profile.

-- 1. Columns: E.164 number (e.g. +2348031234567) and the ISO country chosen.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_country text;
do $$ begin
  alter table public.profiles add constraint profiles_phone_format
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_phone_country_format
    check (phone_country is null or phone_country ~ '^[A-Z]{2}$');
exception when duplicate_object then null; end $$;

-- Shared format check (the web server validates per country first).
create or replace function public._clean_phone(p_phone text)
returns text language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p_phone, '')) ~ '^\+[1-9][0-9]{6,14}$' then btrim(p_phone) end
$$;
create or replace function public._clean_country(p_country text)
returns text language sql immutable set search_path = public as $$
  select case when upper(btrim(coalesce(p_country, ''))) ~ '^[A-Z]{2}$' then upper(btrim(p_country)) end
$$;

-- 2. New sign-ups: the profile takes the number from the sign-up details,
--    only if it is a well-formed E.164 number. The row is still created with
--    the auth user, by the auth user's own id; nothing else changes.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_phone text := public._clean_phone(new.raw_user_meta_data ->> 'phone_number');
begin
  insert into public.profiles (id, full_name, email_verified_at, phone, phone_country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end,
    v_phone,
    case when v_phone is not null then public._clean_country(new.raw_user_meta_data ->> 'phone_country') end
  )
  on conflict (id) do nothing;

  insert into public.accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

-- 3. A client sets or changes their own number (signed-in user's row only).
create or replace function public.set_my_phone(p_phone text, p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := public._clean_phone(p_phone);
  v_country text := public._clean_country(p_country);
  v_old public.profiles;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '28000'; end if;
  if v_phone is null then raise exception 'Enter a valid phone number with its country code.'; end if;
  if v_country is null then raise exception 'Choose the country for this number.'; end if;
  select * into v_old from public.profiles where id = v_uid for update;
  if not found then raise exception 'Your profile could not be found.'; end if;
  if v_old.phone is not distinct from v_phone and v_old.phone_country is not distinct from v_country then
    return jsonb_build_object('phone', v_phone, 'phone_country', v_country, 'changed', false);
  end if;
  update public.profiles set phone = v_phone, phone_country = v_country, updated_at = now() where id = v_uid;
  perform public._audit('PHONE_UPDATED', v_uid, 'profile', v_uid::text, jsonb_build_object(
    'by', 'client', 'before', v_old.phone, 'after', v_phone, 'country', v_country));
  return jsonb_build_object('phone', v_phone, 'phone_country', v_country, 'changed', true);
end $$;
revoke all on function public.set_my_phone(text, text) from public, anon;
grant execute on function public.set_my_phone(text, text) to authenticated;

-- 4. An admin sets, changes or clears a client's number, with a reason.
create or replace function public.admin_set_client_phone(p_user_id uuid, p_phone text, p_country text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_clear boolean := btrim(coalesce(p_phone, '')) = '';
  v_phone text := public._clean_phone(p_phone);
  v_country text := public._clean_country(p_country);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_old public.profiles;
begin
  perform public._require_admin();
  if char_length(v_reason) < 3 then raise exception 'Enter a reason (at least 3 characters).'; end if;
  if not v_clear and v_phone is null then raise exception 'Enter a valid phone number with its country code.'; end if;
  if not v_clear and v_country is null then raise exception 'Choose the country for this number.'; end if;
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Client not found'; end if;
  update public.profiles set phone = case when v_clear then null else v_phone end,
         phone_country = case when v_clear then null else v_country end, updated_at = now()
   where id = p_user_id;
  perform public._audit('PHONE_UPDATED', p_user_id, 'profile', p_user_id::text, jsonb_build_object(
    'by', 'admin', 'before', v_old.phone, 'after', case when v_clear then null else v_phone end,
    'country', case when v_clear then null else v_country end, 'reason', v_reason));
  return jsonb_build_object('phone', case when v_clear then null else v_phone end, 'phone_country', case when v_clear then null else v_country end);
end $$;
revoke all on function public.admin_set_client_phone(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_client_phone(uuid, text, text, text) to authenticated;

-- 5. Admin client search also matches a phone number (digits, with or
--    without the country code or a leading 0). Same columns as before.
create or replace function public.admin_list_customers(p_search text default null::text)
 returns table(id uuid, full_name text, email text, role text, created_at timestamp with time zone, email_confirmed_at timestamp with time zone, last_sign_in_at timestamp with time zone, account_status text, verification_status text, available_balance numeric, account_balance numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_digits text := ltrim(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '0');
begin
  perform public._require_admin();
  return query
    select p.id, p.full_name, u.email::text, p.role, p.created_at, u.email_confirmed_at, u.last_sign_in_at,
           p.account_status, p.verification_status, coalesce(a.available_balance, 0), coalesce(a.account_balance, 0)
    from profiles p join auth.users u on u.id = p.id left join accounts a on a.user_id = p.id
    where p_search is null or p_search = '' or p.full_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%' or p.id::text = p_search
       or (char_length(v_digits) >= 5 and p.phone like '%' || v_digits || '%')
    order by p.created_at desc
    limit 500;
end $function$;

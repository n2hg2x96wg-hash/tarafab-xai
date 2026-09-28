-- Admin-controlled client navigation. Additive only: two functions, no table
-- or data changes. The setting lives in the existing system_settings table
-- under key 'client_nav' as {"hidden": [...]}. With no row, nothing is
-- hidden, so every existing client keeps full access.

-- Sections an admin may hide. Overview, profile, security, preferences and
-- sign-out are not in this list and can never be hidden.
create or replace function public._client_nav_optional()
returns text[] language sql immutable set search_path = public as $$
  select array['portfolio', 'markets', 'transactions', 'deposit', 'withdraw',
               'depositHistory', 'withdrawalHistory', 'notifications', 'support']
$$;

-- Readable by any signed-in user; returns only this one setting.
create or replace function public.client_nav_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'hidden', coalesce(value->'hidden', '[]'::jsonb),
       'updated_at', updated_at)
     from public.system_settings where key = 'client_nav'),
    jsonb_build_object('hidden', '[]'::jsonb, 'updated_at', null))
$$;

create or replace function public.admin_set_client_nav(p_hidden text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_old jsonb; v_hidden text[];
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select coalesce(array_agg(distinct h order by h), '{}') into v_hidden from unnest(coalesce(p_hidden, '{}')) h;
  if exists (select 1 from unnest(v_hidden) h where h <> all(public._client_nav_optional())) then
    raise exception 'Only optional sections can be hidden';
  end if;
  select value into v_old from public.system_settings where key = 'client_nav';
  insert into public.system_settings (key, value, updated_by, updated_at)
  values ('client_nav', jsonb_build_object('hidden', to_jsonb(v_hidden)), v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'admin_client_nav_updated', 'system_settings', 'client_nav',
          jsonb_build_object('before', coalesce(v_old->'hidden', '[]'::jsonb), 'after', to_jsonb(v_hidden)));
  return public.client_nav_config();
end $$;

revoke all on function public._client_nav_optional() from public, anon;
revoke all on function public.client_nav_config() from public, anon;
revoke all on function public.admin_set_client_nav(text[]) from public, anon;
grant execute on function public._client_nav_optional() to authenticated;
grant execute on function public.client_nav_config() to authenticated;
grant execute on function public.admin_set_client_nav(text[]) to authenticated;

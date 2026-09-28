-- Additive: two new tables for admin-to-client notifications, and richer
-- client navigation settings (order + labels). No existing table, row or
-- function signature is removed or changed incompatibly.

/* ---------- client navigation: order + labels ---------- */

create or replace function public._client_nav_optional()
returns text[] language sql immutable set search_path = public as $$
  select array['portfolio', 'markets', 'marketActivity', 'priceHistory', 'transactions', 'performance',
               'deposit', 'withdraw', 'depositHistory', 'withdrawalHistory', 'notifications', 'support']
$$;

create or replace function public._client_nav_all()
returns text[] language sql immutable set search_path = public as $$
  select array['overview', 'profile', 'security', 'preferences'] || public._client_nav_optional()
$$;

create or replace function public.client_nav_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'hidden', coalesce(value->'hidden', '[]'::jsonb),
       'order', coalesce(value->'order', '[]'::jsonb),
       'labels', coalesce(value->'labels', '{}'::jsonb),
       'updated_at', updated_at)
     from public.system_settings where key = 'client_nav'),
    jsonb_build_object('hidden', '[]'::jsonb, 'order', '[]'::jsonb, 'labels', '{}'::jsonb, 'updated_at', null))
$$;

create or replace function public.admin_set_client_nav_config(p_hidden text[], p_order text[], p_labels jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_old jsonb; v_hidden text[]; v_labels jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select coalesce(array_agg(distinct h order by h), '{}') into v_hidden from unnest(coalesce(p_hidden, '{}')) h;
  if exists (select 1 from unnest(v_hidden) h where h <> all(public._client_nav_optional())) then
    raise exception 'Only optional sections can be hidden';
  end if;
  if exists (select 1 from unnest(coalesce(p_order, '{}')) o where o <> all(public._client_nav_all()))
     or (select count(*) from unnest(coalesce(p_order, '{}'))) <> (select count(distinct o) from unnest(coalesce(p_order, '{}')) o) then
    raise exception 'Invalid menu order';
  end if;
  if p_labels is not null and jsonb_typeof(p_labels) <> 'object' then raise exception 'Invalid labels'; end if;
  for k, v in select * from jsonb_each(coalesce(p_labels, '{}'::jsonb)) loop
    if k <> all(public._client_nav_all()) or jsonb_typeof(v) <> 'string' then raise exception 'Invalid labels'; end if;
    if length(trim(v #>> '{}')) between 1 and 32 then v_labels := v_labels || jsonb_build_object(k, trim(v #>> '{}')); end if;
  end loop;
  select value into v_old from public.system_settings where key = 'client_nav';
  insert into public.system_settings (key, value, updated_by, updated_at)
  values ('client_nav', jsonb_build_object('hidden', to_jsonb(v_hidden), 'order', to_jsonb(coalesce(p_order, '{}')), 'labels', v_labels), v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'admin_client_nav_updated', 'system_settings', 'client_nav',
          jsonb_build_object('before', coalesce(v_old, '{}'::jsonb), 'after', jsonb_build_object('hidden', to_jsonb(v_hidden), 'order', to_jsonb(coalesce(p_order, '{}')), 'labels', v_labels)));
  return public.client_nav_config();
end $$;

-- The earlier function keeps working and now preserves order and labels.
create or replace function public.admin_set_client_nav(p_hidden text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cur jsonb := public.client_nav_config();
begin
  return public.admin_set_client_nav_config(
    p_hidden,
    array(select jsonb_array_elements_text(v_cur->'order')),
    v_cur->'labels');
end $$;

-- Server-side check used by money routes: is this section switched off?
create or replace function public.client_nav_is_hidden(p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value->'hidden' ? p_section from public.system_settings where key = 'client_nav'), false)
$$;

/* ---------- notifications ---------- */

create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = all clients
  type text not null check (type in ('account', 'deposit', 'withdrawal', 'security', 'announcement')),
  title text not null check (length(title) between 1 and 120),
  body text not null default '' check (length(body) <= 1000),
  cta_label text check (cta_label is null or length(cta_label) between 1 and 40),
  cta_target text check (cta_target is null or cta_target ~ '^#[A-Za-z]{2,40}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists idx_client_notifications_user on public.client_notifications (user_id, created_at desc);

create table if not exists public.client_notification_reads (
  notification_id uuid not null references public.client_notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.client_notifications enable row level security;
alter table public.client_notification_reads enable row level security;

-- Clients read only active notifications addressed to them or to everyone;
-- admins read all. All writes go through the functions below.
create policy client_notifications_select_own on public.client_notifications for select to authenticated
  using (archived_at is null and (user_id is null or user_id = (select auth.uid())));
create policy client_notifications_select_admin on public.client_notifications for select to authenticated
  using (public.is_admin());
create policy client_notification_reads_select_own on public.client_notification_reads for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.client_mark_notifications_read(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n integer;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  insert into public.client_notification_reads (notification_id, user_id)
  select n.id, v_uid from public.client_notifications n
  where n.id = any(coalesce(p_ids, '{}')) and n.archived_at is null and (n.user_id is null or n.user_id = v_uid)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_send_notification(
  p_user_id uuid, p_type text, p_title text, p_body text, p_cta_label text default null, p_cta_target text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_user_id is not null and not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Client not found'; end if;
  if (nullif(trim(p_cta_label), '') is null) <> (nullif(trim(p_cta_target), '') is null) then
    raise exception 'A button needs both a label and a link';
  end if;
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by)
  values (p_user_id, p_type, trim(p_title), coalesce(trim(p_body), ''), nullif(trim(p_cta_label), ''), nullif(trim(p_cta_target), ''), v_admin)
  returning id into v_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_notification_sent', 'client_notifications', v_id::text,
          jsonb_build_object('type', p_type, 'title', trim(p_title), 'audience', coalesce(p_user_id::text, 'all_clients')));
  return v_id;
end $$;

create or replace function public.admin_archive_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.client_notifications set archived_at = now() where id = p_id and archived_at is null;
  if not found then raise exception 'Notification not found'; end if;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'admin_notification_archived', 'client_notifications', p_id::text, '{}'::jsonb);
end $$;

create or replace function public.admin_notifications()
returns table (id uuid, user_id uuid, type text, title text, body text, cta_label text, cta_target text,
               created_at timestamptz, archived_at timestamptz, read_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select n.id, n.user_id, n.type, n.title, n.body, n.cta_label, n.cta_target, n.created_at, n.archived_at,
           (select count(*) from public.client_notification_reads r where r.notification_id = n.id)
    from public.client_notifications n order by n.created_at desc limit 200;
end $$;

revoke all on function public._client_nav_all() from public, anon;
revoke all on function public.admin_set_client_nav_config(text[], text[], jsonb) from public, anon;
revoke all on function public.client_nav_is_hidden(text) from public, anon;
revoke all on function public.client_mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.admin_send_notification(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_archive_notification(uuid) from public, anon;
revoke all on function public.admin_notifications() from public, anon;
grant execute on function public._client_nav_all() to authenticated;
grant execute on function public.admin_set_client_nav_config(text[], text[], jsonb) to authenticated;
grant execute on function public.client_nav_is_hidden(text) to authenticated;
grant execute on function public.client_mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.admin_send_notification(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_archive_notification(uuid) to authenticated;
grant execute on function public.admin_notifications() to authenticated;

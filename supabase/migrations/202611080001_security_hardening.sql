-- Security hardening. Additive / privilege-tightening only: no data changes.

-- 1. Least privilege on tables. RLS does not apply to TRUNCATE, and API roles
--    never need TRUNCATE / TRIGGER / REFERENCES. Anonymous visitors also lose
--    plain SELECT on private tables (their RLS policies already returned no
--    rows to anon; this removes the grant itself).
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['payment_attempts', 'subscriptions', 'subscription_events', 'wallet_transfers', 'payment_links', 'service_fee_rules', 'deposit_addresses'] loop
    if to_regclass('public.' || t) is not null then execute format('revoke select on public.%I from anon', t); end if;
  end loop;
end $$;

-- 2. Security event log: suspicious activity for admins only. Append-only.
create table if not exists public.security_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  actor uuid,
  ip text check (length(ip) <= 64),
  detail jsonb not null default '{}'::jsonb
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
drop policy if exists security_events_admin_select on public.security_events;
create policy security_events_admin_select on public.security_events for select to authenticated using (public.is_admin());
drop trigger if exists security_events_append_only on public.security_events;
create trigger security_events_append_only before update or delete on public.security_events for each row execute function public._append_only();

-- 3. Shared rate limiting (all server instances count together). Keyed by the
--    signed-in user; a caller can only ever consume their own budget.
create table if not exists public.rate_limit_counters (
  key text not null, window_start timestamptz not null, hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.client_rate_check(p_scope text, p_limit int, p_window_s int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_start timestamptz; v_hits int;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_scope !~ '^[a-z_]{2,32}$' or p_limit not between 1 and 1000 or p_window_s not between 10 and 86400 then
    raise exception 'Invalid rate limit request';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  insert into public.rate_limit_counters as c (key, window_start, hits) values (p_scope || ':' || v_uid, v_start, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1 returning hits into v_hits;
  if v_hits = p_limit + 1 then
    insert into public.security_events (kind, actor, detail) values ('rate_limited', v_uid, jsonb_build_object('scope', p_scope, 'limit', p_limit, 'window_s', p_window_s));
  end if;
  if random() < 0.01 then delete from public.rate_limit_counters where window_start < now() - interval '2 days'; end if;
  return v_hits <= p_limit;
end $$;
revoke all on function public.client_rate_check(text, int, int) from public, anon;
grant execute on function public.client_rate_check(text, int, int) to authenticated;

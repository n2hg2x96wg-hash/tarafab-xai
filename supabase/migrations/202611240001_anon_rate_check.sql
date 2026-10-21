-- Shared rate limit for endpoints used before sign-in (sign-in, sign-up).
--
-- The app's in-memory limiter counts per server instance, and Supabase Auth
-- sees every request coming from the hosting platform's servers rather than
-- the visitor, so neither stops password guessing spread across instances.
-- This counts attempts in the database, shared by every instance.
--
-- Additive only: a new function using the existing rate_limit_counters table.
-- The caller passes a scope and a SHA-256 hex digest computed on the server
-- (of the IP address and/or email), so no address or IP is stored here.
-- Only the server (service role) may call it; browsers cannot.
-- Rollback: drop function public.anon_rate_check(text, text, integer, integer).

create or replace function public.anon_rate_check(p_scope text, p_digest text, p_limit integer, p_window_s integer)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_start timestamptz; v_hits int;
begin
  if p_scope !~ '^[a-z_]{2,32}$' or p_digest !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 1000 or p_window_s not between 10 and 86400 then
    raise exception 'Invalid rate limit request';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  insert into public.rate_limit_counters as c (key, window_start, hits) values ('anon:' || p_scope || ':' || p_digest, v_start, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1 returning hits into v_hits;
  if v_hits = p_limit + 1 then
    insert into public.security_events (kind, actor, detail) values ('rate_limited', null, jsonb_build_object('scope', p_scope, 'limit', p_limit, 'window_s', p_window_s));
  end if;
  if random() < 0.01 then delete from public.rate_limit_counters where window_start < now() - interval '2 days'; end if;
  return v_hits <= p_limit;
end $function$;

revoke all on function public.anon_rate_check(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.anon_rate_check(text, text, integer, integer) to service_role;

-- Sign-in attempt limit: 5 wrong passwords in a row, then sign-in is paused
-- for 5 minutes (the numbers are passed by the server, see
-- app/api/auth/signin). Counted per email + visitor address pair, so a
-- stranger guessing someone's email elsewhere cannot lock them out; the
-- existing per-email and per-address limits (anon_rate_check) stay as the
-- backstop against guessing spread over many addresses.
--
-- Additive only: one new table and three functions; no existing table,
-- policy or row changes. The key is a keyed SHA-256 digest computed on the
-- server, so no email or IP address is stored. Only the server (service
-- role) may call the functions; browsers cannot read or write the table.
-- Rollback:
--   drop function public.signin_attempt_state(text, integer);
--   drop function public.signin_record_failure(text, integer, integer, integer);
--   drop function public.signin_clear_failures(text);
--   drop table public.signin_failures;

create table if not exists public.signin_failures (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  fails integer not null default 0 check (fails >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz
);
alter table public.signin_failures enable row level security;
revoke all on public.signin_failures from public, anon, authenticated;

-- Wrong attempts so far (failures older than p_window_s no longer count)
-- and, while paused, when the pause ends.
create or replace function public.signin_attempt_state(p_digest text, p_window_s integer default 900)
returns table (fails integer, locked_until timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_digest !~ '^[0-9a-f]{64}$' or p_window_s not between 60 and 86400 then raise exception 'Invalid request'; end if;
  return query
    select case when f.last_failed_at < now() - make_interval(secs => p_window_s) or f.locked_until <= now() then 0 else f.fails end,
           case when f.locked_until > now() then f.locked_until end
    from public.signin_failures f where f.digest = p_digest;
end $function$;

-- Records one wrong attempt. On the p_max-th in a row it starts the pause
-- (p_lock_s seconds) and resets the count for after the pause.
create or replace function public.signin_record_failure(p_digest text, p_max integer, p_lock_s integer, p_window_s integer default 900)
returns table (fails integer, locked_until timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
declare v public.signin_failures;
begin
  if p_digest !~ '^[0-9a-f]{64}$' or p_max not between 1 and 50 or p_lock_s not between 30 and 86400 or p_window_s not between 60 and 86400 then
    raise exception 'Invalid request';
  end if;
  insert into public.signin_failures as f (digest, fails, last_failed_at) values (p_digest, 1, now())
  on conflict (digest) do update set
    fails = case
      when f.locked_until > now() then f.fails  -- already paused: the pause stands
      when f.locked_until <= now() or f.last_failed_at < now() - make_interval(secs => p_window_s) then 1
      else f.fails + 1 end,
    last_failed_at = now(),
    locked_until = case when f.locked_until > now() then f.locked_until end
  returning * into v;
  if v.locked_until is null and v.fails >= p_max then
    update public.signin_failures f set fails = 0, locked_until = now() + make_interval(secs => p_lock_s)
      where f.digest = p_digest returning * into v;
    insert into public.security_events (kind, actor, detail)
      values ('signin_paused', null, jsonb_build_object('attempts', p_max, 'pause_s', p_lock_s));
  end if;
  if random() < 0.01 then
    delete from public.signin_failures s where s.last_failed_at < now() - interval '2 days' and (s.locked_until is null or s.locked_until < now());
  end if;
  return query select v.fails, v.locked_until;
end $function$;

-- A successful sign-in starts the count again.
create or replace function public.signin_clear_failures(p_digest text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_digest !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request'; end if;
  delete from public.signin_failures where digest = p_digest and (locked_until is null or locked_until <= now());
end $function$;

revoke all on function public.signin_attempt_state(text, integer) from public, anon, authenticated;
revoke all on function public.signin_record_failure(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.signin_clear_failures(text) from public, anon, authenticated;
grant execute on function public.signin_attempt_state(text, integer) to service_role;
grant execute on function public.signin_record_failure(text, integer, integer, integer) to service_role;
grant execute on function public.signin_clear_failures(text) to service_role;

-- Manual profit credits/debits: a supporting reference or evidence file is
-- no longer required just because an entry is dated before today (owner's
-- decision). Everything else is unchanged:
-- - a backdated entry still needs a reason (at least 10 characters);
-- - a date before the client's account opened still needs the exception
--   confirmation and accounting basis;
-- - the real posting time is still recorded and the entry is flagged
--   "Historical";
-- - debit categories that need support (payout, authorized charge, other)
--   still require a reference or evidence (checked in admin_manual_profit_debit).
-- Only the one check below is removed; no data is changed.
-- Rollback: re-add the p_has_support check inside the v_backdated block.

create or replace function public._manual_profit_dates(p_user_id uuid, p_effective_date date, p_tz_offset_min integer, p_backdate_reason text, p_has_support boolean, p_exception_ack boolean, p_exception_basis text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_today date; v_opened date; v_backdated boolean; v_pre boolean;
  v_backdate text := btrim(regexp_replace(coalesce(p_backdate_reason, ''), '\s+', ' ', 'g'));
  v_basis text := btrim(regexp_replace(coalesce(p_exception_basis, ''), '\s+', ' ', 'g'));
begin
  if p_tz_offset_min is null or p_tz_offset_min not between -840 and 840 then raise exception 'Invalid time zone'; end if;
  if p_effective_date is null then raise exception 'Choose an effective date'; end if;
  v_today := ((now() at time zone 'UTC') - make_interval(mins => p_tz_offset_min))::date;
  if p_effective_date > v_today then raise exception 'The effective date cannot be in the future'; end if;
  if p_effective_date < date '2000-01-01' then raise exception 'Check the effective date'; end if;
  select (created_at at time zone 'UTC' - make_interval(mins => p_tz_offset_min))::date into v_opened from public.profiles where id = p_user_id;
  v_backdated := p_effective_date < v_today;
  v_pre := v_opened is not null and p_effective_date < v_opened;
  if v_backdated then
    if char_length(v_backdate) < 10 then
      raise exception 'Explain why this entry applies to an earlier date (at least 10 characters)';
    end if;
  end if;
  if v_pre then
    if not coalesce(p_exception_ack, false) or char_length(v_basis) < 20 then
      raise exception 'The effective date is before this client''s account was opened (%). Confirm the pre-opening exception and explain the accounting basis (at least 20 characters), or record the entry against the correct account.',
        to_char(v_opened, 'FMMonth FMDD, YYYY');
    end if;
  end if;
  return jsonb_build_object(
    'effective_at', case when v_backdated then ((p_effective_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC' else now() end,
    'backdated', v_backdated, 'pre_opening', v_pre, 'opened', v_opened, 'today', v_today,
    'backdate_reason', nullif(v_backdate, ''), 'exception_basis', case when v_pre then v_basis end);
end $function$;

revoke all on function public._manual_profit_dates(uuid, date, integer, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public._manual_profit_dates(uuid, date, integer, text, boolean, boolean, text) to service_role;

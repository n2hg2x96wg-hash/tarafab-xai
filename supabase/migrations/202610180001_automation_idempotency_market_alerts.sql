-- Add idempotent automation submissions and allow real market alerts in the
-- existing client notification system. Existing rows and other notification
-- types are left unchanged.

alter table public.market_automations
  add column if not exists idempotency_key text;

create unique index if not exists market_automations_user_idempotency_key
  on public.market_automations (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.client_notifications
  drop constraint if exists client_notifications_type_check;

alter table public.client_notifications
  add constraint client_notifications_type_check
  check (type in ('account', 'deposit', 'withdrawal', 'security', 'announcement', 'investment', 'market'));

create or replace function public.record_market_automation_trigger(
  p_automation_id uuid,
  p_observed_value numeric,
  p_observed_at timestamptz,
  p_event_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto public.market_automations;
  v_symbol text;
  v_event_id uuid;
  v_notify boolean;
  v_condition text;
  v_threshold text;
  v_value text;
begin
  if p_observed_value is null or p_observed_at is null or p_event_key is null or length(p_event_key) > 200 then
    raise exception 'Invalid market alert';
  end if;

  select a, ma.symbol into v_auto, v_symbol
    from public.market_automations a
    join public.market_assets ma on ma.id = a.asset_id
   where a.id = p_automation_id and a.status = 'active'
   for update of a;
  if not found then return false; end if;

  insert into public.market_automation_events (automation_id, observed_at, observed_value, event_key, status)
  values (v_auto.id, p_observed_at, p_observed_value, p_event_key, 'triggered')
  on conflict (event_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then return false; end if;

  update public.market_automations
     set status = 'triggered', last_triggered_at = p_observed_at, last_evaluated_at = p_observed_at,
         last_error = null, updated_at = p_observed_at
   where id = v_auto.id;

  if v_auto.notify_in_app then
    select coalesce(p.in_app_enabled, true) into v_notify
      from public.market_notification_preferences p where p.user_id = v_auto.user_id;
    if coalesce(v_notify, true) then
      v_condition := case v_auto.condition
        when 'price_above' then 'price above'
        when 'price_below' then 'price below'
        when 'change_above' then 'change above'
        when 'change_below' then 'change below'
        when 'volume_above' then '24h volume above'
      end;
      v_threshold := case when v_auto.condition like 'price_%' or v_auto.condition = 'volume_above' then '$' else '' end
        || v_auto.threshold::text
        || case when v_auto.condition like 'change_%' then '%' else '' end;
      v_value := case when v_auto.condition like 'price_%' or v_auto.condition = 'volume_above' then '$' else '' end
        || p_observed_value::text
        || case when v_auto.condition like 'change_%' then '%' else '' end;
      insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target)
      values (v_auto.user_id, 'market', 'Market condition confirmed',
              v_symbol || ' ' || v_condition || ' ' || v_threshold || ' confirmed at ' || v_value || '.',
              'View markets', '#markets');
    end if;
  end if;

  return true;
end
$$;

revoke all on function public.record_market_automation_trigger(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_market_automation_trigger(uuid, numeric, timestamptz, text) to service_role;

-- Admin operating mode for the automation engine (active / paused /
-- maintenance). The engine reads it each run: when not active it keeps
-- recording market quotes but evaluates no rules, so the status shown to
-- clients is literally true. Additive; existing rows unchanged.
alter table public.automation_presentation add column if not exists operating_mode text not null default 'active'
  check (operating_mode in ('active', 'paused', 'maintenance'));

-- Status now reports the admin mode, and real activity timestamps for the
-- client activity stream (engine cycle, latest market data received).
create or replace function public.automation_engine_status()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select last_run_at, last_ok_at, last_evaluated from public.automation_engine_state order by id limit 1),
       pr as (select * from public.automation_presentation where id = 1),
       m as (select a.id from public.market_assets a join public.market_quotes q on q.asset_id = a.id
              where a.enabled and a.visible and a.automation_enabled and q.price is not null
                and q.state in ('live', 'delayed') and q.fetched_at > now() - interval '10 minutes'
              order by a.sort_order, a.id)
  select jsonb_build_object(
    'state', case
      when (select last_ok_at from s) is null then 'unavailable'
      when (select operating_mode from pr) = 'paused' then 'paused'
      when (select operating_mode from pr) = 'maintenance' then 'maintenance'
      when (select last_ok_at from s) > now() - interval '3 minutes' then 'running'
      when (select last_run_at from s) > now() - interval '3 minutes' then 'degraded'
      else 'offline' end,
    'last_ok_at', (select last_ok_at from s),
    'last_evaluated', (select last_evaluated from s),
    'market_at', (select max(fetched_at) from public.market_quotes where price is not null),
    'monitored_count', (select count(*) from m),
    'monitored', coalesce((select jsonb_agg(id) from (select id from m limit 6) x), '[]'::jsonb),
    'presentation', (select jsonb_build_object('panel_visible', panel_visible, 'preview_visible', preview_visible,
        'display_name', display_name, 'asset_labels', asset_labels, 'description', description, 'animation', animation,
        'operating_mode', operating_mode) from pr),
    'at', now())
$$;
revoke all on function public.automation_engine_status() from public;
grant execute on function public.automation_engine_status() to anon, authenticated;

create or replace function public.admin_set_automation_presentation(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.automation_presentation; prev public.automation_presentation;
begin
  perform public._require_admin();
  select * into prev from public.automation_presentation where id = 1;
  update public.automation_presentation set
    panel_visible = coalesce((p->>'panel_visible')::boolean, panel_visible),
    preview_visible = coalesce((p->>'preview_visible')::boolean, preview_visible),
    display_name = coalesce(nullif(trim(p->>'display_name'), ''), display_name),
    asset_labels = coalesce(trim(p->>'asset_labels'), asset_labels),
    description = coalesce(trim(p->>'description'), description),
    animation = coalesce(p->>'animation', animation),
    operating_mode = coalesce(p->>'operating_mode', operating_mode),
    updated_at = now(), updated_by = auth.uid()
  where id = 1 returning * into r;
  -- Audit with the previous and new values of everything that changed.
  perform public._audit(
    case when prev.operating_mode is distinct from r.operating_mode then 'automation_engine_mode_' || r.operating_mode
         when prev.panel_visible is distinct from r.panel_visible or prev.preview_visible is distinct from r.preview_visible then 'automation_display_changed'
         else 'automation_presentation_saved' end,
    null, 'automation_presentation', '1',
    jsonb_build_object('previous', to_jsonb(prev) - 'updated_at' - 'updated_by', 'new', to_jsonb(r) - 'updated_at' - 'updated_by'), 'success');
  return to_jsonb(r);
end $$;
revoke all on function public.admin_set_automation_presentation(jsonb) from public, anon;
grant execute on function public.admin_set_automation_presentation(jsonb) to authenticated;

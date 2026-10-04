-- XAI automation engine: verified status for clients/visitors, and an
-- admin-controlled presentation layer. Additive; no existing data changes.
--
-- The status is computed only from the engine's own heartbeat
-- (automation_engine_state, written by the automation-engine function each
-- run) and the market quote table. Presentation settings can change names,
-- copy and visibility, never the status, counts or events.

create table if not exists public.automation_presentation (
  id int primary key default 1 check (id = 1),
  panel_visible boolean not null default true,
  preview_visible boolean not null default true,
  display_name text not null default 'XAI Automation Engine' check (length(display_name) between 1 and 60),
  asset_labels text not null default 'BTC · ETH · supported assets' check (length(asset_labels) <= 80),
  description text not null default 'Configure rules that monitor supported markets. The engine evaluates them every minute and records activity for review.' check (length(description) <= 280),
  animation text not null default 'standard' check (animation in ('off', 'subtle', 'standard')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.automation_presentation (id) values (1) on conflict do nothing;
alter table public.automation_presentation enable row level security;
revoke all on public.automation_presentation from anon, authenticated;

-- Public, read-only. No secrets, no per-user data: heartbeat times, a derived
-- state, and how many assets currently have fresh quotes being monitored.
create or replace function public.automation_engine_status()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select last_run_at, last_ok_at, last_error from public.automation_engine_state order by id limit 1),
       m as (select a.id from public.market_assets a join public.market_quotes q on q.asset_id = a.id
              where a.enabled and a.visible and a.automation_enabled and q.price is not null
                and q.state in ('live', 'delayed') and q.fetched_at > now() - interval '10 minutes'
              order by a.sort_order, a.id)
  select jsonb_build_object(
    'state', case
      when (select last_ok_at from s) is null then 'unavailable'
      when (select last_ok_at from s) > now() - interval '3 minutes' then 'running'
      when (select last_run_at from s) > now() - interval '3 minutes' then 'degraded'
      else 'offline' end,
    'last_ok_at', (select last_ok_at from s),
    'monitored_count', (select count(*) from m),
    'monitored', coalesce((select jsonb_agg(id) from (select id from m limit 6) x), '[]'::jsonb),
    'presentation', (select jsonb_build_object('panel_visible', panel_visible, 'preview_visible', preview_visible,
        'display_name', display_name, 'asset_labels', asset_labels, 'description', description, 'animation', animation)
      from public.automation_presentation where id = 1),
    'at', now())
$$;
revoke all on function public.automation_engine_status() from public;
grant execute on function public.automation_engine_status() to anon, authenticated;

create or replace function public.admin_set_automation_presentation(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.automation_presentation;
begin
  perform public._require_admin();
  update public.automation_presentation set
    panel_visible = coalesce((p->>'panel_visible')::boolean, panel_visible),
    preview_visible = coalesce((p->>'preview_visible')::boolean, preview_visible),
    display_name = coalesce(nullif(trim(p->>'display_name'), ''), display_name),
    asset_labels = coalesce(trim(p->>'asset_labels'), asset_labels),
    description = coalesce(trim(p->>'description'), description),
    animation = coalesce(p->>'animation', animation),
    updated_at = now(), updated_by = auth.uid()
  where id = 1 returning * into r;
  perform public._audit('automation_presentation_saved', null, 'automation_presentation', '1', p, 'success');
  return to_jsonb(r);
end $$;
revoke all on function public.admin_set_automation_presentation(jsonb) from public, anon;
grant execute on function public.admin_set_automation_presentation(jsonb) to authenticated;

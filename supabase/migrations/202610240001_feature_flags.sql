-- Controlled feature states (enabled | disabled | premium | coming_soon |
-- unavailable | admin_only). The server is authoritative: API routes check
-- feature_state() before acting; the UI only reflects it. Admin changes are
-- audited. Missing keys count as enabled, so nothing existing is switched off.
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  state text not null default 'enabled' check (state in ('enabled', 'disabled', 'premium', 'coming_soon', 'unavailable', 'admin_only')),
  label text not null default '',
  note text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
-- anon cannot evaluate is_admin(), so it gets its own policy.
create policy feature_flags_read on public.feature_flags for select to authenticated using (state <> 'admin_only' or public.is_admin());
create policy feature_flags_public on public.feature_flags for select to anon using (state <> 'admin_only');
revoke insert, update, delete on public.feature_flags from anon, authenticated;
insert into public.feature_flags (key, state, label) values
  ('automations', 'enabled', 'Automation Center'),
  ('premium', 'enabled', 'Tarafab Premium'),
  ('wallet_transfer', 'enabled', 'Transfer to Tarafab (external wallet)'),
  ('portfolio_analytics', 'premium', 'Portfolio analytics')
on conflict (key) do nothing;

create or replace function public.feature_state(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select state from public.feature_flags where key = p_key), 'enabled')
$$;
grant execute on function public.feature_state(text) to anon, authenticated;

create or replace function public.admin_set_feature(p_key text, p_state text, p_note text, p_reason text)
returns public.feature_flags language plpgsql security definer set search_path = public as $$
declare r public.feature_flags; old jsonb;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select to_jsonb(f) into old from public.feature_flags f where key = p_key for update;
  if old is null then raise exception 'Unknown feature.'; end if;
  update public.feature_flags set state = p_state, note = coalesce(p_note, ''), updated_by = auth.uid(), updated_at = now()
   where key = p_key returning * into r;
  perform public._audit('feature_state_changed', null, 'feature_flag', p_key, jsonb_build_object('before', old, 'after', to_jsonb(r), 'reason', trim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_set_feature(text, text, text, text) from public, anon;
grant execute on function public.admin_set_feature(text, text, text, text) to authenticated;

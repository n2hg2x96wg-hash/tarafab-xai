-- Adds the Live chat module to the Feature Control Center. Insert-only:
-- existing feature states are never changed.
insert into public.feature_flags (key, state, label, note)
values ('live_chat', 'enabled', 'Live chat', 'Smartsupp support chat for clients')
on conflict (key) do nothing;

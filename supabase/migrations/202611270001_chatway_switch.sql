-- Customer support channels: an independent ON/OFF switch for the Chatway
-- live chat, next to the existing Smartsupp switch ('live_chat', unchanged).
-- Additive only: one new row, OFF until an admin turns it on in Feature
-- Control Center (admin_set_feature: admin-only, reason required, audited).
-- Clients and visitors can read the state (to know whether to load the
-- widget) but cannot change it: feature_flags has no insert/update/delete
-- grant for anon or authenticated.
insert into public.feature_flags (key, state, label, note)
values ('chatway', 'disabled', 'Chatway live chat', 'Chatway support chat for clients and visitors')
on conflict (key) do nothing;

update public.feature_flags set label = 'Smartsupp live chat'
 where key = 'live_chat' and label in ('', 'Live chat');

-- "What's New" release notices reuse the existing team-notification system:
-- adds 'release' to the allowed types. Additive only: every existing value
-- stays valid and no row is read, changed or removed.
alter table public.client_notifications drop constraint if exists client_notifications_type_check;
alter table public.client_notifications add constraint client_notifications_type_check
  check (type = any (array['account','deposit','withdrawal','security','announcement','investment','market','release']));

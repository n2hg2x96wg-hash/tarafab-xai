-- The automation engine status is shown only to signed-in clients and admins
-- (/api/automation/status now requires a session). Permission change only;
-- no data is read, moved or modified.
revoke execute on function public.automation_engine_status() from anon, public;
grant execute on function public.automation_engine_status() to authenticated;

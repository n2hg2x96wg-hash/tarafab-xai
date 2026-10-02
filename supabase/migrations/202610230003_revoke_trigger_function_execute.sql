-- Trigger functions run only as triggers; they are not callable through the API.
revoke all on function public._automation_active_limit() from public, anon, authenticated;
revoke all on function public._withdrawal_fee_on_request() from public, anon, authenticated;
revoke all on function public._withdrawal_fee_on_complete() from public, anon, authenticated;

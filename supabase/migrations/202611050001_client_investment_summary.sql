-- One definition of the client's investment figures, used by Overview,
-- Portfolio and account summaries. Read-only; derived from client_investments
-- (no stored balance is changed or synchronised).
--
-- Status rules (match the existing investment accounting):
--   active                      principal currently invested (equals the
--                               running accounts.invested_balance)
--   pending_activation, approved awaiting activation/review; principal is held
--                               in accounts.pending_balance
--   completed, matured, closed  historical: principal was invested and has
--                               been returned at completion
--   suspended                   invested but paused; still counts as invested
--   rejected, cancelled, expired never invested (principal was released), so
--                               excluded from every total
-- Total invested = active + suspended + historical principal.
create or replace function public.client_investment_summary()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total_invested',      coalesce(sum(principal) filter (where status in ('active', 'suspended', 'completed', 'matured', 'closed')), 0),
    'total_count',         count(*) filter (where status in ('active', 'suspended', 'completed', 'matured', 'closed')),
    'active_principal',    coalesce(sum(principal) filter (where status = 'active'), 0),
    'active_count',        count(*) filter (where status = 'active'),
    'pending_principal',   coalesce(sum(principal) filter (where status in ('pending_activation', 'approved')), 0),
    'pending_count',       count(*) filter (where status in ('pending_activation', 'approved')),
    'completed_principal', coalesce(sum(principal) filter (where status in ('completed', 'matured', 'closed')), 0),
    'completed_count',     count(*) filter (where status in ('completed', 'matured', 'closed')),
    'investment_profit',   coalesce(sum(coalesce(profit_amount, 0)) filter (where status in ('active', 'suspended', 'completed', 'matured', 'closed')), 0))
  from public.client_investments
  where user_id = auth.uid()
$$;
revoke all on function public.client_investment_summary() from public, anon;
grant execute on function public.client_investment_summary() to authenticated;

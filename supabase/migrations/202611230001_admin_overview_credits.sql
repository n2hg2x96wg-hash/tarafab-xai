-- Admin dashboard: report admin account credits next to client deposits.
--
-- admin_overview() counted only `deposit` transactions as money in. Every
-- admin top-up is an `adjustment` with source `admin_funding` (clients see it
-- as "Deposit · Account credit"), so the "Deposits completed" card showed $0
-- while the accounts had been funded through account credits.
--
-- Read-only and additive: one new key, `credits`, is returned; every existing
-- key keeps its exact definition. No table, row or balance is changed.
-- Rollback: re-run the previous definition (the same function without the
-- `credits` key); the dashboard treats a missing `credits` key as unavailable.

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
  pend_dep text[] := array['pending_review', 'pending', 'pending_verification', 'pending_blockchain_confirmation', 'under_review'];
  pend_wdr text[] := array['pending_review', 'requested', 'under_review', 'approved', 'processing'];
begin
  perform public._require_admin();
  select jsonb_build_object(
    'clients', jsonb_build_object(
      'total', (select count(*) from profiles where role = 'customer'),
      'active', (select count(*) from profiles where role = 'customer' and account_status = 'active'),
      'suspended', (select count(*) from profiles where role = 'customer' and account_status = 'suspended'),
      'inactive', (select count(*) from profiles where role = 'customer' and coalesce(account_status, '') <> 'active'),
      'pending_verifications', (select count(*) from profiles where role = 'customer' and verification_status = 'pending'),
      'new_7d', (select count(*) from profiles where role = 'customer' and created_at > now() - interval '7 days')),
    'balances', (select jsonb_build_object(
      'account', coalesce(sum(a.account_balance), 0), 'available', coalesce(sum(a.available_balance), 0),
      'invested', coalesce(sum(a.invested_balance), 0), 'profit', coalesce(sum(a.profit_balance), 0), 'pending', coalesce(sum(a.pending_balance), 0))
      from accounts a join profiles p on p.id = a.user_id where p.role = 'customer'),
    'deposits', (select jsonb_build_object('completed_count', count(*) filter (where status = 'completed'),
      'completed_usd', coalesce(sum(amount) filter (where status = 'completed'), 0),
      'pending', count(*) filter (where status = any(pend_dep))) from transactions where type = 'deposit'),
    -- Admin account credits (top-ups), reported separately from client deposits.
    'credits', (select jsonb_build_object('completed_count', count(*),
      'completed_usd', coalesce(sum(amount), 0),
      'to_available_usd', coalesce(sum(amount) filter (where method = 'available_balance'), 0),
      'to_legacy_usd', coalesce(sum(amount) filter (where method = 'account_balance'), 0))
      from transactions where source = 'admin_funding' and status = 'completed'),
    'withdrawals', (select jsonb_build_object('completed_count', count(*) filter (where status = 'completed'),
      'completed_usd', coalesce(sum(amount) filter (where status = 'completed'), 0),
      'pending', count(*) filter (where status = any(pend_wdr))) from transactions where type = 'withdrawal'),
    -- Investments are reported on their own (never mixed into deposits).
    'investments', (select jsonb_build_object(
      'active_count', count(*) filter (where status = 'active'),
      'active_principal', coalesce(sum(principal) filter (where status = 'active'), 0),
      'awaiting_activation', count(*) filter (where status in ('pending_activation', 'approved')),
      'completed_count', count(*) filter (where status in ('completed', 'matured', 'closed')),
      'completed_principal', coalesce(sum(principal) filter (where status in ('completed', 'matured', 'closed')), 0),
      'products_open', (select count(*) from investment_products where status in ('published', 'active'))) from client_investments),
    'pending', jsonb_build_object(
      'investments', (select count(*) from client_investments where status in ('pending_activation', 'approved')),
      'deposits', (select count(*) from transactions where type = 'deposit' and status = any(pend_dep)),
      'withdrawals', (select count(*) from transactions where type = 'withdrawal' and status = any(pend_wdr)),
      'verifications', (select count(*) from profiles where role = 'customer' and verification_status = 'pending'),
      'transfers_review', (select count(*) from wallet_transfers where status = 'needs_review'),
      'payments_review', (select count(*) from payment_attempts where status = 'pending_verification')),
    'system', jsonb_build_object(
      'market_assets', (select count(*) from market_assets),
      'market_live', (select count(*) from market_quotes where state in ('live', 'delayed') and fetched_at > now() - interval '10 minutes'),
      'market_newest', (select max(fetched_at) from market_quotes),
      'automations_active', (select count(*) from automations where status = 'active'),
      'engine_last_run', (select max(last_evaluated_at) from automations),
      'gateway_key', (select key_hash is not null from payment_gateway_state where id = 1),
      'audit_24h', (select count(*) from audit_logs where created_at > now() - interval '24 hours')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
        'signups', (select count(*) from profiles p where p.role = 'customer' and p.created_at::date = d::date),
        'deposits', (select count(*) from transactions t where t.type = 'deposit' and t.created_at::date = d::date),
        'withdrawals', (select count(*) from transactions t where t.type = 'withdrawal' and t.created_at::date = d::date)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d),
    'recent', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
      select l.action, l.entity, l.created_at, l.result, coalesce(pa.full_name, '') as actor, coalesce(pt.full_name, '') as target
        from audit_logs l left join profiles pa on pa.id = l.actor_id left join profiles pt on pt.id = l.target_user_id
       order by l.created_at desc limit 10) x),
    'at', now()
  ) into r;
  return r;
end $function$;

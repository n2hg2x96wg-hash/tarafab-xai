-- Production hardening. Additive and backward-compatible: no data is changed.
--
-- 1. Defense in depth: signed-in users could hold table-level write grants on
--    tables whose rows are only ever written by security-definer functions.
--    Row level security already blocks those writes (no write policies), but
--    removing the grants means a future policy mistake cannot open them.
--    Reads (SELECT) are untouched. Admin KYC review uses admin_review_kyc(),
--    so the direct-update path it bypassed (without an audit entry) is closed.
revoke insert, update, delete, truncate on
  public.investment_products, public.investment_product_versions, public.client_investments,
  public.investment_transactions, public.client_investment_events,
  public.client_notifications, public.client_notification_reads, public.kyc_submissions
from anon, authenticated;

-- 2. Pin search_path on the remaining helper functions (linter 0011) and keep
--    trigger helpers out of the public API.
alter function public.prevent_modification() set search_path = public;
alter function public._investment_version_guard() set search_path = public;
alter function public._append_only() set search_path = public;
alter function public._duration_interval(int, text, int) set search_path = public;
revoke execute on function public.prevent_modification(), public._duration_interval(int, text, int) from public, anon;

-- 3. Indexes for query patterns that exist today: the admin investment
--    activity tab (entity + newest first) and per-client audit lookups.
create index if not exists idx_audit_logs_entity_created on public.audit_logs (entity, created_at desc);
create index if not exists idx_audit_logs_target_user on public.audit_logs (target_user_id, created_at desc) where target_user_id is not null;

-- 4. Reconciliation report (read-only). It never corrects anything: it lists
--    accounts whose stored figures disagree, so an admin can investigate.
create or replace function public.admin_reconciliation()
returns table (user_id uuid, full_name text, check_name text, expected numeric, actual numeric, difference numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  with a as (
    select ac.user_id, p.full_name, ac.account_balance, ac.available_balance, ac.invested_balance, ac.pending_balance, ac.profit_balance
    from accounts ac left join profiles p on p.id = ac.user_id
  ), holds as (
    select ci.user_id,
           coalesce(sum(ci.principal) filter (where ci.status = 'pending_activation'), 0) as pending_inv,
           coalesce(sum(ci.principal) filter (where ci.status = 'active'), 0) as active_inv
    from client_investments ci group by ci.user_id
  )
  -- Total should equal the sum of its parts.
  select a.user_id, a.full_name, 'total_vs_parts'::text,
         (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance), a.account_balance,
         a.account_balance - (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  from a where a.account_balance <> (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  union all
  -- No stored balance may be negative.
  select a.user_id, a.full_name, 'negative_balance', 0::numeric,
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance),
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance)
  from a where least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance) < 0
  union all
  -- Pending investment requests must be covered by the held (pending) balance.
  select a.user_id, a.full_name, 'pending_investments_not_held', h.pending_inv, a.pending_balance, a.pending_balance - h.pending_inv
  from a join holds h on h.user_id = a.user_id where a.pending_balance < h.pending_inv
  union all
  -- Active investments must be covered by the invested balance.
  select a.user_id, a.full_name, 'active_investments_not_invested', h.active_inv, a.invested_balance, a.invested_balance - h.active_inv
  from a join holds h on h.user_id = a.user_id where a.invested_balance < h.active_inv;
end $$;
revoke all on function public.admin_reconciliation() from public, anon;
grant execute on function public.admin_reconciliation() to authenticated;

-- 5. Recording a legitimate return on a client investment. Same model as
--    admin_adjust_balance: admin only, reason required, row lock, idempotent,
--    an immutable ledger row, and an audit entry with previous/new values.
--    The return goes to profit_balance and the account total together, so the
--    total keeps matching its parts. Nothing is generated automatically.
create or replace function public.admin_record_investment_return(
  p_investment_id uuid, p_amount numeric, p_reason text, p_idempotency_key text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_inv client_investments%rowtype;
  v_old_profit numeric; v_old_total numeric; v_amt numeric; v_tx uuid;
begin
  perform public._require_admin();
  if v_key is null then raise exception 'Invalid request'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Use at most 2 decimal places'; end if;
  v_amt := p_amount;

  select * into v_inv from client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status not in ('active', 'completed', 'matured') then raise exception 'Returns can only be recorded on active or completed investments'; end if;

  select profit_balance, account_balance into v_old_profit, v_old_total from accounts where user_id = v_inv.user_id for update;
  if v_old_profit is null then raise exception 'Account not found'; end if;

  -- Same key again: already recorded, return the current value unchanged.
  if exists (select 1 from transactions where user_id = v_inv.user_id and idempotency_key = v_key) then
    return v_old_profit;
  end if;

  update accounts set profit_balance = profit_balance + v_amt, account_balance = account_balance + v_amt, updated_at = now()
   where user_id = v_inv.user_id;

  insert into transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key)
  values (v_inv.user_id, 'return', 'profit_balance', v_amt, 'credit', 'completed',
          coalesce(v_inv.reference, 'INV') || '-R' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          trim(p_reason), v_key)
  returning id into v_tx;
  insert into investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'return');

  insert into audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_return_recorded', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'amount', v_amt, 'transaction_id', v_tx,
                             'previous_profit_balance', v_old_profit, 'new_profit_balance', v_old_profit + v_amt,
                             'previous_account_balance', v_old_total, 'new_account_balance', v_old_total + v_amt,
                             'reason', trim(p_reason)));
  return v_old_profit + v_amt;
end $$;
revoke all on function public.admin_record_investment_return(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_record_investment_return(uuid, numeric, text, text) to authenticated;

-- 6. admin_stats gains customer account totals (additive keys), so the admin
--    dashboard no longer loads every client to compute them in the browser.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'total_customers', (select count(*) from profiles where role = 'customer'),
    'active_customers', (select count(*) from profiles where role = 'customer' and account_status = 'active'),
    'suspended_customers', (select count(*) from profiles where role = 'customer' and account_status = 'suspended'),
    'pending_verifications', (select count(*) from profiles where role = 'customer' and verification_status = 'pending'),
    'unconfirmed_emails', (select count(*) from auth.users u join profiles p on p.id = u.id where p.role = 'customer' and u.email_confirmed_at is null),
    'total_deposits_usd', (select coalesce(sum(amount), 0) from transactions where type = 'deposit' and status = 'completed'),
    'pending_deposits', (select count(*) from transactions where type = 'deposit' and status in ('pending','pending_verification','pending_blockchain_confirmation')),
    'pending_withdrawals', (select count(*) from transactions where type = 'withdrawal' and status in ('requested','under_review','approved','processing')),
    'completed_withdrawals', (select count(*) from transactions where type = 'withdrawal' and status = 'completed'),
    'total_available_usd', (select coalesce(sum(available_balance), 0) from accounts),
    'total_account_usd', (select coalesce(sum(a.account_balance), 0) from accounts a join profiles p on p.id = a.user_id where p.role = 'customer'),
    'customers_with_accounts', (select count(*) from accounts a join profiles p on p.id = a.user_id where p.role = 'customer'),
    'signups_14d', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', (select count(*) from profiles p where p.role = 'customer' and p.created_at::date = d::date)) order by d), '[]'::jsonb)
                    from generate_series(current_date - 13, current_date, interval '1 day') d),
    'audit_24h', (select count(*) from audit_logs where created_at > now() - interval '24 hours')
  ) into r;
  return r;
end $$;

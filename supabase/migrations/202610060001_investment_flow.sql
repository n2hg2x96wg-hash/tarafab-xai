-- Investment flow: clients submit, admins review, money moves only through
-- these functions. Additive: constraints are widened (existing values stay
-- valid), new columns have defaults, and the earlier functions are kept.
--
-- How money moves, using the existing balance fields only:
--   submit    available -= amount, pending += amount              (held)
--   approve   pending -= amount, invested += principal, account_balance -= fee
--   reject    pending -= amount, available += amount              (released)
--   cancel    same as reject; only while still pending
--   complete  invested -= principal, available += principal
-- Nothing else is changed, balances are never recalculated, and no return or
-- profit is ever generated here.

/* ---------- product lifecycle ---------- */

alter table public.investment_products drop constraint investment_products_status_check;
alter table public.investment_products add constraint investment_products_status_check
  check (status in ('draft', 'published', 'active', 'paused', 'archived', 'under_review', 'suspended', 'closed'));

alter table public.investment_product_versions
  add column if not exists duration_value int check (duration_value is null or duration_value between 1 and 3650),
  add column if not exists duration_unit text check (duration_unit is null or duration_unit in ('days', 'weeks', 'months', 'years')),
  add column if not exists cancellation_allowed boolean not null default false,
  add column if not exists cancellation_terms text;

alter table public.investment_product_versions drop constraint investment_product_versions_check1;
alter table public.investment_product_versions add constraint investment_product_versions_check1
  check (return_type <> 'fixed_rate' or (return_rate_pct is not null and (term_days is not null or duration_value is not null)));
alter table public.investment_product_versions add constraint investment_product_versions_duration_pair
  check ((duration_value is null) = (duration_unit is null));

/* ---------- client investment lifecycle ---------- */

alter table public.client_investments drop constraint client_investments_status_check;
alter table public.client_investments add constraint client_investments_status_check
  check (status in ('pending_activation', 'active', 'completed', 'rejected', 'cancelled', 'suspended', 'matured', 'closed'));

alter table public.client_investments
  add column if not exists reference text unique,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists completed_at timestamptz;

-- Stale-balance protection: one open (pending) request per product per client.
create unique index if not exists client_investments_one_pending
  on public.client_investments (user_id, product_id) where status = 'pending_activation';

create or replace function public._duration_interval(p_value int, p_unit text, p_days int)
returns interval language sql immutable as $$
  select case
    when p_value is not null and p_unit = 'days' then make_interval(days => p_value)
    when p_value is not null and p_unit = 'weeks' then make_interval(weeks => p_value)
    when p_value is not null and p_unit = 'months' then make_interval(months => p_value)
    when p_value is not null and p_unit = 'years' then make_interval(years => p_value)
    when p_days is not null then make_interval(days => p_days)
  end
$$;

create or replace function public._inv_event(p_inv uuid, p_from text, p_to text, p_actor uuid, p_reason text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.client_investment_events (client_investment_id, from_status, to_status, actor_id, reason)
  values (p_inv, p_from, p_to, p_actor, nullif(trim(p_reason), ''));
$$;

/* ---------- admin: products (new version with duration unit + cancellation) ---------- */

create or replace function public.admin_save_product_draft_v2(
  p_product_id uuid, p_code text, p_name text, p_description text,
  p_min_amount numeric, p_max_amount numeric, p_duration_value int, p_duration_unit text, p_risk_level text,
  p_risk_disclosure text, p_terms_text text, p_entry_fee_pct numeric,
  p_return_type text, p_return_rate_pct numeric, p_kyc_required boolean,
  p_cancellation_allowed boolean, p_cancellation_terms text
) returns public.investment_product_versions
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_product public.investment_products; v_ver public.investment_product_versions; v_next int;
  v_days int := case when p_duration_unit = 'days' then p_duration_value end;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if (p_duration_value is null) <> (p_duration_unit is null) then raise exception 'Give both a duration and its unit, or neither'; end if;
  if coalesce(p_cancellation_allowed, false) and coalesce(trim(p_cancellation_terms), '') = '' then
    raise exception 'Describe the cancellation rule when cancellation is allowed';
  end if;

  if p_product_id is null then
    insert into public.investment_products (code, created_by) values (lower(trim(p_code)), v_admin) returning * into v_product;
  else
    select * into v_product from public.investment_products where id = p_product_id for update;
    if not found then raise exception 'Product not found'; end if;
    if v_product.status in ('archived', 'closed') then raise exception 'An archived product cannot be edited'; end if;
  end if;

  select * into v_ver from public.investment_product_versions where product_id = v_product.id order by version desc limit 1;

  if found and v_ver.published_at is null then
    update public.investment_product_versions set
      name = trim(p_name), description = trim(p_description),
      min_amount = round(p_min_amount, 2), max_amount = round(p_max_amount, 2),
      term_days = v_days, duration_value = p_duration_value, duration_unit = p_duration_unit, risk_level = p_risk_level,
      risk_disclosure = trim(p_risk_disclosure), terms_text = trim(p_terms_text),
      entry_fee_pct = coalesce(p_entry_fee_pct, 0), return_type = coalesce(p_return_type, 'none'),
      return_rate_pct = p_return_rate_pct,
      eligibility = jsonb_build_object('kyc_required', coalesce(p_kyc_required, true)),
      cancellation_allowed = coalesce(p_cancellation_allowed, false),
      cancellation_terms = nullif(trim(p_cancellation_terms), '')
    where id = v_ver.id returning * into v_ver;
  else
    v_next := coalesce(v_ver.version, 0) + 1;
    insert into public.investment_product_versions (
      product_id, version, name, description, min_amount, max_amount, term_days, duration_value, duration_unit, risk_level,
      risk_disclosure, terms_text, entry_fee_pct, return_type, return_rate_pct, eligibility, cancellation_allowed, cancellation_terms, created_by
    ) values (
      v_product.id, v_next, trim(p_name), trim(p_description), round(p_min_amount, 2), round(p_max_amount, 2),
      v_days, p_duration_value, p_duration_unit, p_risk_level, trim(p_risk_disclosure), trim(p_terms_text), coalesce(p_entry_fee_pct, 0),
      coalesce(p_return_type, 'none'), p_return_rate_pct, jsonb_build_object('kyc_required', coalesce(p_kyc_required, true)),
      coalesce(p_cancellation_allowed, false), nullif(trim(p_cancellation_terms), ''), v_admin
    ) returning * into v_ver;
  end if;

  update public.investment_products set updated_at = now() where id = v_product.id;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_draft_saved', 'investment_product', v_product.id::text,
          jsonb_build_object('version', v_ver.version, 'version_id', v_ver.id, 'name', v_ver.name));
  return v_ver;
end $$;

-- Publishing now also moves a draft product to "published" (not yet visible).
create or replace function public.admin_publish_product_version(p_version_id uuid)
returns public.investment_product_versions
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_ver public.investment_product_versions;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into v_ver from public.investment_product_versions where id = p_version_id for update;
  if not found then raise exception 'Version not found'; end if;
  if v_ver.published_at is not null then raise exception 'This version is already published'; end if;

  update public.investment_product_versions set published_at = now(), published_by = v_admin
    where id = p_version_id returning * into v_ver;
  update public.investment_products
     set current_version_id = p_version_id, updated_at = now(),
         status = case when status in ('draft', 'under_review') then 'published' else status end
   where id = v_ver.product_id;

  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_version_published', 'investment_product', v_ver.product_id::text,
          jsonb_build_object('version', v_ver.version, 'version_id', v_ver.id));
  return v_ver;
end $$;

create or replace function public.admin_set_investment_product_status(p_product_id uuid, p_status text, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_product public.investment_products;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('draft', 'published', 'active', 'paused', 'archived') then raise exception 'Unknown status'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into v_product from public.investment_products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_product.status in ('archived', 'closed') then raise exception 'An archived product cannot be changed'; end if;
  if p_status in ('published', 'active') and v_product.current_version_id is null then
    raise exception 'Publish the terms first';
  end if;

  update public.investment_products set status = p_status, updated_at = now() where id = p_product_id;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_status', 'investment_product', p_product_id::text,
          jsonb_build_object('from', v_product.status, 'to', p_status, 'reason', trim(p_reason)));
  return p_status;
end $$;

/* ---------- client: submit an investment (held until reviewed) ---------- */

create or replace function public.client_submit_investment(
  p_version_id uuid, p_amount numeric, p_accept_terms boolean, p_idempotency_key text
) returns public.client_investments
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_key text := public._check_idempotency_key(p_idempotency_key);
  v_ver public.investment_product_versions; v_product public.investment_products;
  v_acc public.accounts; v_inv public.client_investments; v_amt numeric; v_ref text; v_tx uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_key is null then raise exception 'Missing request key'; end if;

  -- The same request arriving again returns what it created the first time.
  select * into v_inv from public.client_investments where user_id = v_uid and idempotency_key = v_key;
  if found then return v_inv; end if;

  if p_accept_terms is not true then raise exception 'Please confirm you have read and accept the terms'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Enter a valid amount'; end if;
  v_amt := p_amount;

  select * into v_ver from public.investment_product_versions where id = p_version_id;
  if not found or v_ver.published_at is null then raise exception 'This product is not available'; end if;
  select * into v_product from public.investment_products where id = v_ver.product_id for share;
  if v_product.status <> 'active' then raise exception 'This product is not open for investment'; end if;
  -- The terms the client accepted must be the ones currently offered.
  if v_product.current_version_id <> v_ver.id then raise exception 'These terms have been updated. Please review the latest terms.'; end if;

  if coalesce((v_ver.eligibility->>'kyc_required')::boolean, true) and not exists (
    select 1 from public.kyc_submissions k where k.user_id = v_uid and k.status = 'verified'
  ) then
    raise exception 'Complete identity verification (KYC) before investing';
  end if;

  if v_amt < v_ver.min_amount then raise exception 'The minimum for this product is %', to_char(v_ver.min_amount, 'FM999,999,999,990.00'); end if;
  if v_ver.max_amount is not null and v_amt > v_ver.max_amount then
    raise exception 'The maximum for this product is %', to_char(v_ver.max_amount, 'FM999,999,999,990.00');
  end if;

  if (select count(*) from public.client_investments where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many investment requests. Please wait and try again.';
  end if;

  -- Lock the account so two requests cannot both spend the same balance.
  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  if v_acc.available_balance < v_amt then raise exception 'Your available balance is not enough for this amount'; end if;

  v_ref := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  begin
    insert into public.client_investments (
      user_id, account_id, product_id, product_version_id, principal, fee_amount, currency, status,
      terms_accepted_at, idempotency_key, reference
    ) values (
      v_uid, v_acc.id, v_product.id, v_ver.id, v_amt, round(v_amt * v_ver.entry_fee_pct, 2), 'USD', 'pending_activation',
      now(), v_key, v_ref
    ) returning * into v_inv;
  exception when unique_violation then
    select * into v_inv from public.client_investments where user_id = v_uid and idempotency_key = v_key;
    if found then return v_inv; end if;
    raise exception 'You already have a pending request for this product';
  end;

  update public.accounts set available_balance = available_balance - v_amt,
         pending_balance = pending_balance + v_amt, updated_at = now()
   where id = v_acc.id;

  -- Internal move, not money leaving the account: direction left empty.
  insert into public.transactions (user_id, type, method, amount, status, reference, notes)
  values (v_uid, 'investment', 'available_balance', v_amt, 'pending_review', v_ref, 'Held for investment: ' || v_ver.name)
  returning id into v_tx;
  insert into public.investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'principal_in');

  perform public._inv_event(v_inv.id, null, 'pending_activation', v_uid, null);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'investment_submitted', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_ref, 'amount', v_amt, 'product_id', v_product.id, 'version', v_ver.version));
  return v_inv;
end $$;

-- A client may withdraw their own request while it is still pending.
create or replace function public.client_cancel_investment(p_investment_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_inv public.client_investments;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_inv from public.client_investments where id = p_investment_id and user_id = v_uid for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status <> 'pending_activation' then raise exception 'Only a pending request can be cancelled'; end if;
  perform 1 from public.accounts where id = v_inv.account_id for update;

  update public.accounts set pending_balance = pending_balance - v_inv.principal,
         available_balance = available_balance + v_inv.principal, updated_at = now()
   where id = v_inv.account_id;
  update public.client_investments set status = 'cancelled', updated_at = now() where id = v_inv.id;
  update public.transactions t set status = 'cancelled', updated_at = now()
    from public.investment_transactions it where it.transaction_id = t.id and it.client_investment_id = v_inv.id and it.kind = 'principal_in';
  perform public._inv_event(v_inv.id, 'pending_activation', 'cancelled', v_uid, 'Cancelled by client');
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'investment_cancelled', 'client_investment', v_inv.id::text, jsonb_build_object('reference', v_inv.reference));
  return 'cancelled';
end $$;

/* ---------- admin: review, complete ---------- */

create or replace function public.admin_review_investment(p_investment_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_inv public.client_investments; v_ver public.investment_product_versions;
  v_acc public.accounts; v_principal numeric; v_status text; v_tx uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Action must be approve or reject'; end if;
  if p_action = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reject'; end if;

  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status <> 'pending_activation' then raise exception 'This investment was already %', v_inv.status; end if;
  select * into v_ver from public.investment_product_versions where id = v_inv.product_version_id;
  select * into v_acc from public.accounts where id = v_inv.account_id for update;
  -- The held amount must still be there; if a manual adjustment removed it,
  -- stop rather than let a balance go wrong.
  if v_acc.pending_balance < v_inv.principal then
    raise exception 'The held amount is no longer in the client''s pending balance; check recent adjustments';
  end if;

  if p_action = 'approve' then
    v_principal := v_inv.principal - v_inv.fee_amount;
    if v_acc.account_balance < v_inv.fee_amount then raise exception 'Account balance is lower than the entry fee'; end if;
    update public.accounts set pending_balance = pending_balance - v_inv.principal,
           invested_balance = invested_balance + v_principal,
           account_balance = account_balance - v_inv.fee_amount, updated_at = now()
     where id = v_acc.id;
    update public.client_investments set status = 'active', principal = v_principal,
           start_date = now(), maturity_date = now() + public._duration_interval(v_ver.duration_value, v_ver.duration_unit, v_ver.term_days),
           reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
     where id = v_inv.id;
    update public.transactions t set status = 'completed', updated_at = now()
      from public.investment_transactions it where it.transaction_id = t.id and it.client_investment_id = v_inv.id and it.kind = 'principal_in';
    if v_inv.fee_amount > 0 then
      insert into public.transactions (user_id, type, method, amount, direction, status, reference, notes)
      values (v_inv.user_id, 'fee', 'account_balance', v_inv.fee_amount, 'debit', 'completed', v_inv.reference || '-FEE', 'Entry fee: ' || v_ver.name)
      returning id into v_tx;
      insert into public.investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'fee');
    end if;
    v_status := 'active';
  else
    update public.accounts set pending_balance = pending_balance - v_inv.principal,
           available_balance = available_balance + v_inv.principal, updated_at = now()
     where id = v_acc.id;
    update public.client_investments set status = 'rejected', rejection_reason = trim(p_reason),
           reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
     where id = v_inv.id;
    update public.transactions t set status = 'rejected', updated_at = now(), notes = coalesce(t.notes, '') || ' | Rejected: ' || trim(p_reason)
      from public.investment_transactions it where it.transaction_id = t.id and it.client_investment_id = v_inv.id and it.kind = 'principal_in';
    v_status := 'rejected';
  end if;

  perform public._inv_event(v_inv.id, 'pending_activation', v_status, v_admin, p_reason);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_' || case when v_status = 'active' then 'approved' else 'rejected' end,
          'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'amount', v_inv.principal, 'fee', v_inv.fee_amount,
                             'from', 'pending_activation', 'to', v_status, 'reason', nullif(trim(p_reason), '')));
  return v_status;
end $$;

-- Ends an active investment and returns its principal to the available
-- balance. Returns/profit are NOT added here; they are recorded separately.
create or replace function public.admin_complete_investment(p_investment_id uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_inv public.client_investments; v_acc public.accounts; v_tx uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status <> 'active' then raise exception 'Only an active investment can be completed'; end if;
  select * into v_acc from public.accounts where id = v_inv.account_id for update;
  if v_acc.invested_balance < v_inv.principal then
    raise exception 'The client''s invested balance is lower than this principal; check recent adjustments';
  end if;

  update public.accounts set invested_balance = invested_balance - v_inv.principal,
         available_balance = available_balance + v_inv.principal, updated_at = now()
   where id = v_acc.id;
  update public.client_investments set status = 'completed', completed_at = now(), updated_at = now() where id = v_inv.id;
  insert into public.transactions (user_id, type, method, amount, status, reference, notes)
  values (v_inv.user_id, 'investment', 'invested_balance', v_inv.principal, 'completed', v_inv.reference || '-END', 'Principal returned to available balance')
  returning id into v_tx;
  insert into public.investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'principal_out');
  perform public._inv_event(v_inv.id, 'active', 'completed', v_admin, p_reason);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_completed', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'principal', v_inv.principal, 'reason', trim(p_reason)));
  return 'completed';
end $$;

revoke all on function public.admin_save_product_draft_v2(uuid, text, text, text, numeric, numeric, int, text, text, text, text, numeric, text, numeric, boolean, boolean, text) from public, anon;
revoke all on function public.client_submit_investment(uuid, numeric, boolean, text) from public, anon;
revoke all on function public.client_cancel_investment(uuid) from public, anon;
revoke all on function public.admin_review_investment(uuid, text, text) from public, anon;
revoke all on function public.admin_complete_investment(uuid, text) from public, anon;
revoke all on function public._inv_event(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_save_product_draft_v2(uuid, text, text, text, numeric, numeric, int, text, text, text, text, numeric, text, numeric, boolean, boolean, text) to authenticated;
grant execute on function public.client_submit_investment(uuid, numeric, boolean, text) to authenticated;
grant execute on function public.client_cancel_investment(uuid) to authenticated;
grant execute on function public.admin_review_investment(uuid, text, text) to authenticated;
grant execute on function public.admin_complete_investment(uuid, text) to authenticated;

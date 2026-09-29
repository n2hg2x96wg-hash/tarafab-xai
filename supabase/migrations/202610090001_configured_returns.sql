-- Configured (projected) returns, expected totals, extra statuses and a
-- status-transition guard. Additive and backward-compatible.
--
-- A product version can state its return as a % of principal (fixed_rate,
-- existing) or a flat amount (fixed_amount, new). When a client invests, the
-- expected return and expected total are computed by the database from that
-- exact version and stored on the investment, so later product changes never
-- alter existing investments. They are PROJECTIONS: money is credited only
-- through admin_set_investment_profit(), which is what profit_amount records.

alter table public.investment_product_versions add column if not exists return_amount numeric(14,2);

alter table public.investment_product_versions drop constraint if exists investment_product_versions_return_type_check;
alter table public.investment_product_versions
  add constraint investment_product_versions_return_type_check check (return_type in ('none', 'fixed_rate', 'fixed_amount'));
alter table public.investment_product_versions drop constraint if exists investment_product_versions_check2;
alter table public.investment_product_versions
  add constraint investment_product_versions_return_shape check (
    (return_type = 'none' and return_rate_pct is null and return_amount is null)
    or (return_type = 'fixed_rate' and return_amount is null)
    or (return_type = 'fixed_amount' and return_rate_pct is null)
  );
alter table public.investment_product_versions drop constraint if exists investment_product_versions_check1;
alter table public.investment_product_versions
  add constraint investment_product_versions_return_terms check (
    (return_type <> 'fixed_rate' or (return_rate_pct is not null and (term_days is not null or duration_value is not null)))
    and (return_type <> 'fixed_amount' or (term_days is not null or duration_value is not null))
    -- a draft may be saved without the amount; publishing requires it
    and (return_type <> 'fixed_amount' or return_amount is not null or published_at is null)
  );
alter table public.investment_product_versions drop constraint if exists investment_product_versions_return_amount_check;
alter table public.investment_product_versions
  add constraint investment_product_versions_return_amount_check check (return_amount is null or (return_amount >= 0 and return_amount <= 1000000000));

alter table public.client_investments
  add column if not exists return_type text not null default 'none',
  add column if not exists expected_return numeric(14,2) not null default 0,
  add column if not exists expected_total numeric(14,2);

-- Existing rows: no configured return, expected total = principal - fee.
update public.client_investments set expected_total = principal where expected_total is null and status in ('pending_activation');
update public.client_investments set expected_total = principal where expected_total is null;
alter table public.client_investments alter column expected_total set default 0;
alter table public.client_investments alter column expected_total set not null;

alter table public.client_investments drop constraint if exists client_investments_status_check;
alter table public.client_investments add constraint client_investments_status_check check (status in
  ('pending_activation', 'approved', 'active', 'completed', 'rejected', 'cancelled', 'expired', 'suspended', 'matured', 'closed'));

-- Only valid status moves are allowed, whoever (or whatever function) tries.
create or replace function public._client_investment_transition_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'pending_activation' and new.status in ('approved', 'active', 'rejected', 'cancelled', 'expired'))
    or (old.status = 'approved' and new.status in ('active', 'cancelled'))
    or (old.status = 'active' and new.status in ('completed', 'suspended', 'matured'))
    or (old.status = 'suspended' and new.status in ('active', 'completed'))
    or (old.status = 'matured' and new.status in ('completed', 'closed'))
    or (old.status = 'completed' and new.status = 'closed')
  ) then
    raise exception 'Invalid status change: % to %', old.status, new.status;
  end if;
  return new;
end $$;
drop trigger if exists client_investments_transition_guard on public.client_investments;
create trigger client_investments_transition_guard before update of status on public.client_investments
  for each row execute function public._client_investment_transition_guard();
revoke execute on function public._client_investment_transition_guard() from public, anon, authenticated;

-- Draft save with the configured flat return. Wraps v2 (same admin check,
-- validation, versioning and audit), then records the amount on the draft.
create or replace function public.admin_save_product_draft_v3(
  p_product_id uuid, p_code text, p_name text, p_description text, p_min_amount numeric, p_max_amount numeric,
  p_duration_value int, p_duration_unit text, p_risk_level text, p_risk_disclosure text, p_terms_text text,
  p_entry_fee_pct numeric, p_return_type text, p_return_rate_pct numeric, p_return_amount numeric,
  p_kyc_required boolean, p_cancellation_allowed boolean, p_cancellation_terms text
) returns public.investment_product_versions
language plpgsql security definer set search_path = public as $$
declare v_ver public.investment_product_versions;
begin
  perform public._require_admin();
  if coalesce(p_return_type, 'none') not in ('none', 'fixed_rate', 'fixed_amount') then raise exception 'Unknown return type'; end if;
  if p_return_type = 'fixed_amount' and (p_return_amount is null or p_return_amount < 0 or p_return_amount <> round(p_return_amount, 2)) then
    raise exception 'Enter the configured return amount (2 decimals at most)';
  end if;
  v_ver := public.admin_save_product_draft_v2(p_product_id, p_code, p_name, p_description, p_min_amount, p_max_amount,
    p_duration_value, p_duration_unit, p_risk_level, p_risk_disclosure, p_terms_text, p_entry_fee_pct,
    coalesce(p_return_type, 'none'), case when p_return_type = 'fixed_amount' then null else p_return_rate_pct end,
    p_kyc_required, p_cancellation_allowed, p_cancellation_terms);
  if p_return_type = 'fixed_amount' then
    update public.investment_product_versions set return_amount = round(p_return_amount, 2) where id = v_ver.id returning * into v_ver;
  end if;
  return v_ver;
end $$;
revoke all on function public.admin_save_product_draft_v3(uuid, text, text, text, numeric, numeric, int, text, text, text, text, numeric, text, numeric, numeric, boolean, boolean, text) from public, anon;
grant execute on function public.admin_save_product_draft_v3(uuid, text, text, text, numeric, numeric, int, text, text, text, text, numeric, text, numeric, numeric, boolean, boolean, text) to authenticated;

-- Submit: also snapshots the projected return from the exact version.
create or replace function public.client_submit_investment(p_version_id uuid, p_amount numeric, p_accept_terms boolean, p_idempotency_key text)
returns public.client_investments
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_key text := public._check_idempotency_key(p_idempotency_key);
  v_ver public.investment_product_versions; v_product public.investment_products;
  v_acc public.accounts; v_inv public.client_investments; v_amt numeric; v_ref text; v_tx uuid;
  v_fee numeric; v_net numeric; v_exp numeric;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_key is null then raise exception 'Missing request key'; end if;

  select * into v_inv from public.client_investments where user_id = v_uid and idempotency_key = v_key;
  if found then return v_inv; end if;

  if p_accept_terms is not true then raise exception 'Please confirm you have read and accept the terms'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Enter a valid amount'; end if;
  v_amt := p_amount;

  select * into v_ver from public.investment_product_versions where id = p_version_id;
  if not found or v_ver.published_at is null then raise exception 'This product is not available'; end if;
  select * into v_product from public.investment_products where id = v_ver.product_id for share;
  if v_product.status <> 'active' then raise exception 'This product is not open for investment'; end if;
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

  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  if v_acc.available_balance < v_amt then raise exception 'Your available balance is not enough for this amount'; end if;

  v_fee := round(v_amt * v_ver.entry_fee_pct, 2);
  v_net := v_amt - v_fee;
  -- Projection only, from this version's own terms. Nothing is credited here.
  v_exp := case v_ver.return_type
    when 'fixed_rate' then round(v_net * v_ver.return_rate_pct / 100, 2)
    when 'fixed_amount' then v_ver.return_amount
    else 0 end;
  v_ref := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  begin
    insert into public.client_investments (
      user_id, account_id, product_id, product_version_id, principal, fee_amount, currency, status,
      terms_accepted_at, idempotency_key, reference, return_type, expected_return, expected_total
    ) values (
      v_uid, v_acc.id, v_product.id, v_ver.id, v_amt, v_fee, 'USD', 'pending_activation',
      now(), v_key, v_ref, v_ver.return_type, v_exp, v_net + v_exp
    ) returning * into v_inv;
  exception when unique_violation then
    select * into v_inv from public.client_investments where user_id = v_uid and idempotency_key = v_key;
    if found then return v_inv; end if;
    raise exception 'You already have a pending request for this product';
  end;

  update public.accounts set available_balance = available_balance - v_amt,
         pending_balance = pending_balance + v_amt, updated_at = now()
   where id = v_acc.id;

  insert into public.transactions (user_id, type, method, amount, status, reference, notes)
  values (v_uid, 'investment', 'available_balance', v_amt, 'pending_review', v_ref, 'Held for investment: ' || v_ver.name)
  returning id into v_tx;
  insert into public.investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'principal_in');

  perform public._inv_event(v_inv.id, null, 'pending_activation', v_uid, null);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'investment_submitted', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_ref, 'amount', v_amt, 'product_id', v_product.id, 'version', v_ver.version,
                             'return_type', v_ver.return_type, 'expected_return', v_exp));
  return v_inv;
end $$;

-- A pending request that will not be processed can be expired by an admin:
-- the hold is released, the record is kept.
create or replace function public.admin_expire_investment(p_investment_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_inv public.client_investments;
begin
  perform public._require_admin();
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.status <> 'pending_activation' then raise exception 'Only a pending request can be expired'; end if;
  perform 1 from public.accounts where user_id = v_inv.user_id for update;
  update public.accounts set pending_balance = pending_balance - v_inv.principal,
         available_balance = available_balance + v_inv.principal, updated_at = now()
   where user_id = v_inv.user_id and pending_balance >= v_inv.principal;
  if not found then raise exception 'The held amount does not match; review reconciliation before expiring this request'; end if;
  update public.client_investments set status = 'expired', reviewed_by = v_admin, reviewed_at = now(), updated_at = now() where id = v_inv.id;
  update public.transactions t set status = 'cancelled', updated_at = now(), notes = coalesce(t.notes, '') || ' | Expired: ' || trim(p_reason)
   from public.investment_transactions it where it.client_investment_id = v_inv.id and it.transaction_id = t.id and it.kind = 'principal_in';
  perform public._inv_event(v_inv.id, 'pending_activation', 'expired', v_admin, p_reason);
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_expired', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'amount', v_inv.principal, 'reason', trim(p_reason)));
  return 'expired';
end $$;
revoke all on function public.admin_expire_investment(uuid, text) from public, anon;
grant execute on function public.admin_expire_investment(uuid, text) to authenticated;

-- Admin list filters by expected return and sorts by maturity.
create index if not exists client_investments_maturity_idx on public.client_investments (maturity_date) where status = 'active';

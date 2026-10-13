-- Record Historical Investment (admin).
--
-- Documents a genuine investment a client made earlier that is missing from
-- the investment history. A historical record never moves money: it creates
-- no deposit, no debit and no credit, and leaves every balance unchanged. A
-- return already credited to the client can be linked to it (no new credit).
-- Ledger differences are left for the existing reconciliation report, where an
-- active historical investment not backed by the invested balance shows up.
--
-- Additive only: two new columns on client_investments, two new admin-only
-- tables, a private evidence bucket, new functions, and guards on existing
-- functions that change nothing for existing (non-historical) investments.

-- 1. Columns ------------------------------------------------------------------
alter table public.client_investments
  add column if not exists is_historical boolean not null default false,
  add column if not exists historical_voided_at timestamptz;

-- 2. Admin record (one per historical investment) -----------------------------
create table if not exists public.historical_investment_records (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null unique references public.client_investments(id),
  user_id uuid not null references public.profiles(id),
  admin_id uuid not null,
  product_id uuid not null references public.investment_products(id),
  product_version_id uuid not null references public.investment_product_versions(id),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'USD',
  effective_date date not null,                 -- when the investment genuinely occurred
  effective_at timestamptz not null,            -- same date as stored on the investment
  recorded_at timestamptz not null default now(), -- when it was added here (never backdated)
  status_recorded text not null check (status_recorded in ('active', 'completed', 'matured', 'cancelled')),
  status_basis text not null,                   -- how the status was established
  completed_date date,
  original_reference text,
  original_transaction_id uuid references public.transactions(id),
  evidence_reference text,
  evidence_path text,                           -- private bucket historical-evidence
  reason text not null,
  linked_return_transaction_ids uuid[] not null default '{}',
  configured_return numeric(18, 2),             -- per product terms; informational, never credited
  possible_duplicate_ids uuid[] not null default '{}',
  distinct_confirmed boolean not null default false,
  review_required boolean not null default false,
  review_notes text[] not null default '{}',
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  idempotency_key text not null,
  unique (user_id, idempotency_key)
);
create unique index if not exists historical_investment_records_reference_unique
  on public.historical_investment_records (user_id, lower(original_reference))
  where original_reference is not null and voided_at is null;
create index if not exists historical_investment_records_user_idx
  on public.historical_investment_records (user_id, recorded_at desc);

-- Every later change, append-only.
create table if not exists public.historical_investment_corrections (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.historical_investment_records(id),
  investment_id uuid not null references public.client_investments(id),
  admin_id uuid not null,
  action text not null check (action in ('status', 'link_returns', 'resolve_review', 'void')),
  before jsonb not null default '{}',
  after jsonb not null default '{}',
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists historical_investment_corrections_record_idx
  on public.historical_investment_corrections (record_id, created_at);

alter table public.historical_investment_records enable row level security;
alter table public.historical_investment_corrections enable row level security;
revoke all on public.historical_investment_records, public.historical_investment_corrections from anon, authenticated;
grant select on public.historical_investment_records, public.historical_investment_corrections to authenticated;
create policy historical_investment_records_select_admin on public.historical_investment_records
  for select to authenticated using (public.is_admin());
create policy historical_investment_corrections_select_admin on public.historical_investment_corrections
  for select to authenticated using (public.is_admin());

-- 3. Evidence files: private, admins only ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('historical-evidence', 'historical-evidence', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy historical_evidence_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'historical-evidence' and public.is_admin()
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy historical_evidence_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'historical-evidence' and public.is_admin());

-- 4. Duplicate detection (shared by the check and the record functions) ------
-- blocking: the reference already belongs to a recorded investment.
-- possible: an investment of this client with the same amount within 3 days
--           (or the same product within 31 days) of the effective date.
create or replace function public._historical_duplicates(
  p_user_id uuid, p_product_id uuid, p_amount numeric, p_effective_date date, p_reference text)
returns jsonb language sql stable security definer set search_path = public as $$
  with ref as (select nullif(lower(btrim(coalesce(p_reference, ''))), '') as r),
  blocking as (
    select ci.id, ci.reference, 'An investment already has this reference' as why
      from public.client_investments ci, ref
     where ref.r is not null and lower(ci.reference) = ref.r and ci.historical_voided_at is null
    union
    select h.investment_id, ci.reference, 'A historical record already uses this original reference'
      from public.historical_investment_records h join public.client_investments ci on ci.id = h.investment_id, ref
     where ref.r is not null and h.user_id = p_user_id and lower(h.original_reference) = ref.r and h.voided_at is null
    union
    select it.client_investment_id, ci.reference, 'This transaction is already linked to an investment'
      from public.transactions t
      join public.investment_transactions it on it.transaction_id = t.id
      join public.client_investments ci on ci.id = it.client_investment_id, ref
     where ref.r is not null and t.user_id = p_user_id and lower(t.reference) = ref.r and ci.historical_voided_at is null
  ),
  possible as (
    select ci.id, ci.reference, ci.status, ci.principal, ci.fee_amount, ci.product_id, ci.is_historical,
           coalesce(ci.start_date, ci.created_at) as dated
      from public.client_investments ci
     where ci.user_id = p_user_id and ci.historical_voided_at is null
       and ci.status not in ('rejected', 'expired')
       and (ci.principal = p_amount or ci.principal + ci.fee_amount = p_amount)
       and abs(coalesce(ci.start_date, ci.created_at)::date - p_effective_date)
           <= case when ci.product_id = p_product_id then 31 else 3 end
       and ci.id not in (select id from blocking)
  )
  select jsonb_build_object(
    'blocking', coalesce((select jsonb_agg(jsonb_build_object('investment_id', id, 'reference', reference, 'why', why)) from blocking), '[]'::jsonb),
    'possible', coalesce((select jsonb_agg(jsonb_build_object('investment_id', id, 'reference', reference, 'status', status,
                  'principal', principal, 'fee_amount', fee_amount, 'same_product', product_id = p_product_id,
                  'historical', is_historical, 'dated', dated) order by dated) from possible), '[]'::jsonb))
$$;
revoke all on function public._historical_duplicates(uuid, uuid, numeric, date, text) from public, anon, authenticated;

-- 5. Pre-check for the review screen (read-only) -----------------------------
create or replace function public.admin_historical_investment_check(
  p_user_id uuid, p_product_version_id uuid, p_amount numeric, p_effective_date date, p_original_reference text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ver public.investment_product_versions; v_dups jsonb; v_match public.transactions;
begin
  perform public._require_admin();
  select * into v_ver from public.investment_product_versions where id = p_product_version_id;
  if not found then raise exception 'Choose the investment product'; end if;
  v_dups := public._historical_duplicates(p_user_id, v_ver.product_id, p_amount, p_effective_date, p_original_reference);
  select * into v_match from public.transactions
   where user_id = p_user_id and nullif(btrim(coalesce(p_original_reference, '')), '') is not null
     and lower(reference) = lower(btrim(p_original_reference))
   order by created_at limit 1;
  return v_dups || jsonb_build_object(
    'matched_transaction', case when v_match.id is null then null else jsonb_build_object(
      'id', v_match.id, 'type', v_match.type, 'amount', v_match.amount, 'status', v_match.status,
      'reference', v_match.reference, 'effective_at', v_match.effective_at) end,
    -- Returns already credited to this client that no investment claims yet.
    'linkable_returns', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference, 'amount', t.amount,
        'type', t.type, 'source', t.source, 'effective_at', t.effective_at, 'notes', left(t.notes, 120)) order by t.effective_at desc)
      from (select * from public.transactions t
             where t.user_id = p_user_id and t.method = 'profit_balance' and t.direction = 'credit' and t.status = 'completed'
               and not exists (select 1 from public.investment_transactions it where it.transaction_id = t.id)
             order by t.effective_at desc limit 100) t), '[]'::jsonb),
    'configured_return', case v_ver.return_type
      when 'fixed_rate' then round(p_amount * v_ver.return_rate_pct / 100, 2)
      when 'fixed_amount' then v_ver.return_amount else null end);
end $$;
revoke all on function public.admin_historical_investment_check(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.admin_historical_investment_check(uuid, uuid, numeric, date, text) to authenticated;

-- 6. Record a historical investment ------------------------------------------
-- p_effective_date is the admin's calendar date; p_tz_offset_min is the
-- admin's UTC offset (JavaScript getTimezoneOffset: UTC − local). The date is
-- stored at noon of that day in the admin's time zone. created_at stays the
-- real time of recording. Balances are never changed here.
create or replace function public.admin_record_historical_investment(
  p_user_id uuid, p_product_version_id uuid, p_amount numeric, p_effective_date date,
  p_status text, p_status_basis text, p_reason text, p_idempotency_key text,
  p_completed_date date default null, p_original_reference text default null,
  p_evidence_reference text default null, p_evidence_path text default null,
  p_return_transaction_ids uuid[] default '{}', p_confirm_distinct boolean default false,
  p_tz_offset_min integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_basis text := btrim(regexp_replace(coalesce(p_status_basis, ''), '\s+', ' ', 'g'));
  v_ref text := nullif(btrim(coalesce(p_original_reference, '')), '');
  v_evref text := nullif(btrim(regexp_replace(coalesce(p_evidence_reference, ''), '\s+', ' ', 'g')), '');
  v_evpath text := nullif(btrim(coalesce(p_evidence_path, '')), '');
  v_returns uuid[] := coalesce(p_return_transaction_ids, '{}');
  v_existing public.historical_investment_records; v_client public.profiles; v_acc public.accounts;
  v_ver public.investment_product_versions; v_product public.investment_products;
  v_today date; v_effective timestamptz; v_completed timestamptz; v_maturity timestamptz;
  v_dups jsonb; v_possible uuid[] := '{}'; v_notes text[] := '{}'; v_match uuid;
  v_profit numeric := 0; v_n int; v_expected numeric; v_configured numeric;
  v_inv public.client_investments; v_row public.historical_investment_records; v_invref text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if v_key is null then raise exception 'Missing request key'; end if;

  -- A repeated request returns the record already made.
  select * into v_existing from public.historical_investment_records where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'record_id', v_existing.id, 'investment_id', v_existing.investment_id,
      'reference', (select reference from public.client_investments where id = v_existing.investment_id),
      'recorded_at', v_existing.recorded_at, 'effective_at', v_existing.effective_at,
      'review_required', v_existing.review_required, 'review_notes', to_jsonb(v_existing.review_notes));
  end if;

  select * into v_client from public.profiles where id = p_user_id;
  if not found or coalesce(v_client.role, 'customer') <> 'customer' then raise exception 'Choose an existing client account'; end if;
  select * into v_acc from public.accounts where user_id = p_user_id;
  if not found then raise exception 'This client has no account record'; end if;

  select * into v_ver from public.investment_product_versions where id = p_product_version_id;
  if not found or v_ver.published_at is null then raise exception 'Choose a published version of the investment product'; end if;
  select * into v_product from public.investment_products where id = v_ver.product_id;

  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Enter an amount with at most 2 decimal places'; end if;
  if p_amount > 100000000 then raise exception 'The amount is too large for a single investment'; end if;
  if v_ver.currency <> 'USD' then raise exception 'This product version is not in USD'; end if;

  if p_tz_offset_min is null or p_tz_offset_min not between -840 and 840 then raise exception 'Invalid time zone'; end if;
  v_today := ((now() at time zone 'UTC') - make_interval(mins => p_tz_offset_min))::date;
  if p_effective_date is null then raise exception 'Choose the effective investment date'; end if;
  if p_effective_date > v_today then raise exception 'The effective investment date cannot be in the future'; end if;
  if p_effective_date < date '2000-01-01' then raise exception 'Check the effective investment date'; end if;
  v_effective := ((p_effective_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC';

  if p_status not in ('active', 'completed', 'matured', 'cancelled') then raise exception 'Choose the investment''s actual status'; end if;
  if char_length(v_basis) < 5 then raise exception 'Explain how the status was established (at least 5 characters)'; end if;
  if char_length(v_reason) < 10 then raise exception 'Explain why this record is being added (at least 10 characters)'; end if;
  if char_length(v_reason) > 1000 or char_length(v_basis) > 500 then raise exception 'Keep the explanations shorter'; end if;
  if v_ref is not null and char_length(v_ref) > 120 then raise exception 'The transaction reference is too long'; end if;
  if v_evref is not null and char_length(v_evref) > 500 then raise exception 'The evidence reference is too long'; end if;
  if v_evpath is not null then
    if v_evpath !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{8,100}\.(pdf|jpg|png|webp)$' then raise exception 'Invalid evidence file'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'historical-evidence' and name = v_evpath) then
      raise exception 'The evidence file was not found; upload it again';
    end if;
  end if;

  if p_completed_date is not null then
    if p_status = 'active' then raise exception 'An active investment has no completion date'; end if;
    if p_completed_date < p_effective_date then raise exception 'The completion date cannot be before the investment date'; end if;
    if p_completed_date > v_today then raise exception 'The completion date cannot be in the future'; end if;
    v_completed := ((p_completed_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC';
  end if;

  -- One historical submission per client at a time; duplicates are checked
  -- after this lock so two identical submissions cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('historical-investment:' || p_user_id::text, 0));
  select * into v_existing from public.historical_investment_records where user_id = p_user_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('duplicate', true, 'record_id', v_existing.id, 'investment_id', v_existing.investment_id,
      'reference', (select reference from public.client_investments where id = v_existing.investment_id),
      'recorded_at', v_existing.recorded_at, 'effective_at', v_existing.effective_at,
      'review_required', v_existing.review_required, 'review_notes', to_jsonb(v_existing.review_notes));
  end if;

  v_dups := public._historical_duplicates(p_user_id, v_product.id, p_amount, p_effective_date, v_ref);
  if jsonb_array_length(v_dups->'blocking') > 0 then
    raise exception 'Already recorded as %. Review that record instead of adding another.',
      coalesce(v_dups->'blocking'->0->>'reference', 'an existing investment');
  end if;
  select coalesce(array_agg((x->>'investment_id')::uuid), '{}') into v_possible from jsonb_array_elements(v_dups->'possible') x;
  if cardinality(v_possible) > 0 and not coalesce(p_confirm_distinct, false) then
    raise exception 'A similar investment exists (%). Review it, or confirm this is a separate investment.',
      coalesce(v_dups->'possible'->0->>'reference', 'same amount and date');
  end if;

  if v_ref is not null then
    select id into v_match from public.transactions
     where user_id = p_user_id and lower(reference) = lower(v_ref) order by created_at limit 1;
  end if;

  -- Returns already credited to this client, linked without a new credit.
  if cardinality(v_returns) > 0 then
    if cardinality(v_returns) > 50 then raise exception 'Link at most 50 return transactions'; end if;
    perform 1 from public.transactions where id = any(v_returns) for update;
    select count(*), coalesce(sum(amount), 0) into v_n, v_profit
      from public.transactions t
     where t.id = any(v_returns) and t.user_id = p_user_id and t.method = 'profit_balance'
       and t.direction = 'credit' and t.status = 'completed'
       and t.effective_at::date >= p_effective_date
       and not exists (select 1 from public.investment_transactions it where it.transaction_id = t.id);
    if v_n <> cardinality(array(select distinct unnest(v_returns))) then
      raise exception 'A selected return cannot be linked: it must be this client''s completed profit credit, dated on or after the investment, and not already linked to an investment';
    end if;
    if p_status = 'cancelled' then raise exception 'A cancelled investment cannot carry returns'; end if;
  end if;

  -- Product terms (never changed): maturity from the version's duration and
  -- the configured return, shown for information only.
  v_maturity := v_effective + public._duration_interval(v_ver.duration_value, v_ver.duration_unit, v_ver.term_days);
  v_configured := case v_ver.return_type
    when 'fixed_rate' then round(p_amount * v_ver.return_rate_pct / 100, 2)
    when 'fixed_amount' then v_ver.return_amount else null end;
  v_expected := coalesce(v_configured, 0);

  -- Anything that cannot be confirmed from the inputs is flagged for review.
  if v_ver.published_at::date > p_effective_date then
    v_notes := array_append(v_notes, 'These product terms were published after the investment date; confirm they applied');
  end if;
  if p_amount < v_ver.min_amount or (v_ver.max_amount is not null and p_amount > v_ver.max_amount) then
    v_notes := array_append(v_notes, 'The amount is outside this product version''s limits');
  end if;
  if p_effective_date < (v_client.created_at at time zone 'UTC')::date then
    v_notes := array_append(v_notes, 'The investment date is before the client''s account was opened here');
  end if;
  if v_ref is null then v_notes := array_append(v_notes, 'No original transaction reference'); end if;
  if v_evref is null and v_evpath is null then v_notes := array_append(v_notes, 'No supporting evidence attached'); end if;
  if p_status in ('completed', 'matured') and p_completed_date is null then
    v_notes := array_append(v_notes, 'Completion date not provided');
  end if;
  if p_status = 'active' and v_maturity is not null and v_maturity < now() then
    v_notes := array_append(v_notes, 'Past its maturity date under the product terms but recorded as active');
  end if;
  if p_status in ('completed', 'matured') and v_maturity is not null and v_completed is not null and v_completed < v_maturity - interval '1 day' then
    v_notes := array_append(v_notes, 'Recorded as ended before the product term ends');
  end if;
  if p_status in ('completed', 'matured') and coalesce(v_configured, 0) > 0 and cardinality(v_returns) = 0 then
    v_notes := array_append(v_notes, ('No return linked; check whether the configured return of ' || to_char(v_configured, 'FM999,999,999,990.00') || ' USD was credited'));
  end if;
  if p_status = 'active' then
    v_notes := array_append(v_notes, 'Active principal is not in the invested balance; review in Reconciliation');
  end if;

  v_invref := 'INV-H' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9));
  insert into public.client_investments (
    user_id, account_id, product_id, product_version_id, principal, fee_amount, currency, status,
    start_date, maturity_date, completed_at, terms_accepted_at, idempotency_key, reference,
    reviewed_by, reviewed_at, profit_amount, return_type, return_rate_pct, return_amount,
    expected_return, expected_total, is_historical
  ) values (
    p_user_id, v_acc.id, v_product.id, v_ver.id, p_amount, 0, 'USD', p_status,
    v_effective, v_maturity, v_completed, v_effective, 'hist:' || v_key, v_invref,
    v_admin, now(), v_profit, v_ver.return_type, v_ver.return_rate_pct, v_ver.return_amount,
    v_expected, p_amount + v_expected, true
  ) returning * into v_inv;

  if cardinality(v_returns) > 0 then
    insert into public.investment_transactions (client_investment_id, transaction_id, kind)
    select v_inv.id, x, 'return' from (select distinct unnest(v_returns) x) s;
  end if;

  perform public._inv_event(v_inv.id, null, p_status, v_admin, 'Historical investment recorded');

  insert into public.historical_investment_records (
    investment_id, user_id, admin_id, product_id, product_version_id, amount, currency, effective_date, effective_at,
    status_recorded, status_basis, completed_date, original_reference, original_transaction_id,
    evidence_reference, evidence_path, reason, linked_return_transaction_ids, configured_return,
    possible_duplicate_ids, distinct_confirmed, review_required, review_notes, idempotency_key
  ) values (
    v_inv.id, p_user_id, v_admin, v_product.id, v_ver.id, p_amount, 'USD', p_effective_date, v_effective,
    p_status, v_basis, p_completed_date, v_ref, v_match,
    v_evref, v_evpath, v_reason, array(select distinct unnest(v_returns)), v_configured,
    v_possible, coalesce(p_confirm_distinct, false) and cardinality(v_possible) > 0, cardinality(v_notes) > 0, v_notes, v_key
  ) returning * into v_row;

  perform public._audit('HISTORICAL_INVESTMENT_RECORDED', p_user_id, 'client_investment', v_inv.id::text, jsonb_build_object(
    'record_id', v_row.id, 'reference', v_invref, 'product_id', v_product.id, 'product_code', v_product.code,
    'product_version_id', v_ver.id, 'product_version', v_ver.version, 'amount', p_amount, 'currency', 'USD',
    'effective_date', p_effective_date, 'effective_at', v_effective, 'recorded_at', v_row.recorded_at,
    'status', p_status, 'status_basis', v_basis, 'completed_date', p_completed_date,
    'original_reference', v_ref, 'original_transaction_id', v_match,
    'evidence_reference', v_evref, 'evidence_path', v_evpath, 'reason', v_reason,
    'linked_return_transaction_ids', to_jsonb(v_row.linked_return_transaction_ids), 'linked_return_total', v_profit,
    'possible_duplicate_ids', to_jsonb(v_possible), 'distinct_confirmed', v_row.distinct_confirmed,
    'review_notes', to_jsonb(v_notes), 'balances_changed', false));

  return jsonb_build_object('duplicate', false, 'record_id', v_row.id, 'investment_id', v_inv.id, 'reference', v_invref,
    'recorded_at', v_row.recorded_at, 'effective_at', v_effective, 'status', p_status, 'linked_return_total', v_profit,
    'review_required', v_row.review_required, 'review_notes', to_jsonb(v_notes));
end $$;
revoke all on function public.admin_record_historical_investment(uuid, uuid, numeric, date, text, text, text, text, date, text, text, text, uuid[], boolean, integer) from public, anon;
grant execute on function public.admin_record_historical_investment(uuid, uuid, numeric, date, text, text, text, text, date, text, text, text, uuid[], boolean, integer) to authenticated;

-- 7. Authorized corrections (append-only; never moves money) -----------------
-- status:         a later status change, through the normal transition rules
-- link_returns:   link more already-credited returns (no new credit)
-- resolve_review: mark the review flags as checked
-- void:           withdraw a record entered in error. The rows stay; the
--                 investment is hidden from the client and from totals, and
--                 the return links it made are released so they can be linked
--                 to the corrected record.
create or replace function public.admin_correct_historical_investment(
  p_record_id uuid, p_action text, p_reason text,
  p_status text default null, p_completed_date date default null,
  p_return_transaction_ids uuid[] default '{}', p_tz_offset_min integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_rec public.historical_investment_records; v_inv public.client_investments;
  v_returns uuid[] := array(select distinct unnest(coalesce(p_return_transaction_ids, '{}')));
  v_today date; v_completed timestamptz; v_n int; v_sum numeric; v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if char_length(v_reason) < 5 then raise exception 'Enter a reason for this correction (at least 5 characters)'; end if;
  if p_action not in ('status', 'link_returns', 'resolve_review', 'void') then raise exception 'Unknown correction'; end if;
  if p_tz_offset_min is null or p_tz_offset_min not between -840 and 840 then raise exception 'Invalid time zone'; end if;
  v_today := ((now() at time zone 'UTC') - make_interval(mins => p_tz_offset_min))::date;

  select * into v_rec from public.historical_investment_records where id = p_record_id for update;
  if not found then raise exception 'Historical record not found'; end if;
  select * into v_inv from public.client_investments where id = v_rec.investment_id for update;
  if v_rec.voided_at is not null then
    if p_action = 'void' then return jsonb_build_object('record_id', v_rec.id, 'voided_at', v_rec.voided_at, 'duplicate', true); end if;
    raise exception 'This record was voided';
  end if;
  v_before := jsonb_build_object('status', v_inv.status, 'completed_at', v_inv.completed_at, 'profit_amount', v_inv.profit_amount,
    'linked_return_transaction_ids', to_jsonb(v_rec.linked_return_transaction_ids), 'review_required', v_rec.review_required);

  if p_action = 'status' then
    if p_status is null or p_status = v_inv.status then raise exception 'Choose a different status'; end if;
    if p_completed_date is not null then
      if p_completed_date < v_rec.effective_date or p_completed_date > v_today then raise exception 'Check the completion date'; end if;
      v_completed := ((p_completed_date + time '12:00') + make_interval(mins => p_tz_offset_min)) at time zone 'UTC';
    end if;
    -- The transition guard trigger refuses any change the normal workflow does not allow.
    update public.client_investments set status = p_status, completed_at = coalesce(v_completed, completed_at), updated_at = now()
     where id = v_inv.id returning * into v_inv;
    perform public._inv_event(v_inv.id, (v_before->>'status'), p_status, v_admin, 'Historical record corrected: ' || v_reason);

  elsif p_action = 'link_returns' then
    if cardinality(v_returns) = 0 or cardinality(v_returns) > 50 then raise exception 'Choose the return transactions to link'; end if;
    if v_inv.status = 'cancelled' then raise exception 'A cancelled investment cannot carry returns'; end if;
    perform 1 from public.transactions where id = any(v_returns) for update;
    select count(*), coalesce(sum(amount), 0) into v_n, v_sum
      from public.transactions t
     where t.id = any(v_returns) and t.user_id = v_rec.user_id and t.method = 'profit_balance'
       and t.direction = 'credit' and t.status = 'completed' and t.effective_at::date >= v_rec.effective_date
       and not exists (select 1 from public.investment_transactions it where it.transaction_id = t.id);
    if v_n <> cardinality(v_returns) then
      raise exception 'A selected return cannot be linked: it must be this client''s completed profit credit, dated on or after the investment, and not already linked to an investment';
    end if;
    insert into public.investment_transactions (client_investment_id, transaction_id, kind)
    select v_inv.id, x, 'return' from unnest(v_returns) x;
    update public.client_investments set profit_amount = profit_amount + v_sum, updated_at = now() where id = v_inv.id returning * into v_inv;
    update public.historical_investment_records set linked_return_transaction_ids = linked_return_transaction_ids || v_returns
     where id = v_rec.id returning * into v_rec;
    perform public._inv_event(v_inv.id, v_inv.status, v_inv.status, v_admin, 'Existing return linked to historical record');

  elsif p_action = 'resolve_review' then
    if not v_rec.review_required then raise exception 'This record has no open review'; end if;
    update public.historical_investment_records set review_required = false,
           review_notes = array_append(review_notes, 'Reviewed: ' || v_reason) where id = v_rec.id returning * into v_rec;

  else -- void
    delete from public.investment_transactions
     where client_investment_id = v_inv.id and kind = 'return' and transaction_id = any(v_rec.linked_return_transaction_ids);
    update public.client_investments set historical_voided_at = now(), profit_amount = 0, updated_at = now()
     where id = v_inv.id returning * into v_inv;
    update public.historical_investment_records set voided_at = now(), voided_by = v_admin, void_reason = v_reason
     where id = v_rec.id returning * into v_rec;
    perform public._inv_event(v_inv.id, v_inv.status, v_inv.status, v_admin, 'Historical record voided: ' || v_reason);
  end if;

  v_after := jsonb_build_object('status', v_inv.status, 'completed_at', v_inv.completed_at, 'profit_amount', v_inv.profit_amount,
    'linked_return_transaction_ids', to_jsonb(v_rec.linked_return_transaction_ids), 'review_required', v_rec.review_required,
    'voided_at', v_rec.voided_at);
  insert into public.historical_investment_corrections (record_id, investment_id, admin_id, action, before, after, reason)
  values (v_rec.id, v_inv.id, v_admin, p_action, v_before, v_after, v_reason);
  perform public._audit('HISTORICAL_INVESTMENT_CORRECTED', v_rec.user_id, 'client_investment', v_inv.id::text,
    jsonb_build_object('record_id', v_rec.id, 'reference', v_inv.reference, 'action', p_action, 'before', v_before,
                       'after', v_after, 'reason', v_reason, 'balances_changed', false));
  return jsonb_build_object('record_id', v_rec.id, 'action', p_action, 'after', v_after);
end $$;
revoke all on function public.admin_correct_historical_investment(uuid, text, text, text, date, uuid[], integer) from public, anon;
grant execute on function public.admin_correct_historical_investment(uuid, text, text, text, date, uuid[], integer) to authenticated;

-- 8. Guards on existing functions --------------------------------------------
-- Each definition below is the current one with a single added condition that
-- applies only to historical records; existing investments behave as before.

-- 8a. Completion returns the principal from the invested balance and credits
--     the configured return. A historical record was never held there, so it
--     cannot be completed through this path (use a status correction).
create or replace function public.admin_complete_investment(p_investment_id uuid, p_reason text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_inv public.client_investments;
  v_version public.investment_product_versions;
  v_acc public.accounts;
  v_tx uuid;
  v_completion_key text;
  v_configured_profit numeric;
  v_ledger_profit numeric;
  v_unknown_ledger_direction boolean;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;

  select * into v_inv from public.client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.is_historical then
    raise exception 'This is a historical record: its principal was never held in the invested balance. Change its status with a historical-record correction instead.';
  end if;
  if v_inv.status = 'completed' then return 'completed'; end if;
  if v_inv.status <> 'active' then raise exception 'Only an active investment can be completed'; end if;
  if v_inv.maturity_date is not null and v_inv.maturity_date > now() then
    raise exception 'This investment is not eligible for completion until its maturity date';
  end if;

  select * into v_acc from public.accounts where id = v_inv.account_id for update;
  if not found then raise exception 'Account not found'; end if;
  if v_acc.invested_balance < v_inv.principal then
    raise exception 'The client''s invested balance is lower than this principal; check recent adjustments';
  end if;

  select * into v_version from public.investment_product_versions where id = v_inv.product_version_id;
  if found then
    v_configured_profit := case v_version.return_type
      when 'fixed_rate' then case when v_version.return_rate_pct is not null
        then round(v_inv.principal * v_version.return_rate_pct / 100, 2) end
      when 'fixed_amount' then v_version.return_amount
      else null
    end;
  end if;

  select coalesce(sum(case when t.direction = 'debit' then -t.amount else t.amount end), 0)
    into v_ledger_profit
    from public.investment_transactions it
    join public.transactions t on t.id = it.transaction_id
   where it.client_investment_id = v_inv.id
     and it.kind = 'return'
     and t.status in ('completed', 'approved')
     and t.direction in ('credit', 'debit');
  select exists (
    select 1
      from public.investment_transactions it
      join public.transactions t on t.id = it.transaction_id
     where it.client_investment_id = v_inv.id
       and it.kind = 'return'
       and t.status in ('completed', 'approved')
       and t.direction is null
  ) into v_unknown_ledger_direction;

  v_completion_key := 'inv-complete-' || replace(v_inv.id::text, '-', '');
  update public.accounts
     set invested_balance = invested_balance - v_inv.principal,
         available_balance = available_balance + v_inv.principal,
         updated_at = now()
   where id = v_acc.id;
  update public.client_investments
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = v_inv.id;

  insert into public.transactions
    (user_id, type, method, amount, status, reference, notes, idempotency_key)
  values
    (v_inv.user_id, 'investment', 'invested_balance', v_inv.principal, 'completed',
     v_inv.reference || '-END', 'Principal returned to available balance',
     v_completion_key)
  returning id into v_tx;
  insert into public.investment_transactions (client_investment_id, transaction_id, kind)
  values (v_inv.id, v_tx, 'principal_out');

  perform public._inv_event(v_inv.id, 'active', 'completed', v_admin, p_reason);

  if v_configured_profit is not null and v_configured_profit > 0
     and v_inv.profit_amount = 0 and v_ledger_profit = 0 and not v_unknown_ledger_direction then
    perform public.admin_set_investment_profit(
      v_inv.id,
      v_configured_profit,
      'Configured product version return on completion',
      'inv-completion-profit-' || replace(v_inv.id::text, '-', '')
    );
  end if;

  insert into public.audit_logs
    (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values
    (v_admin, v_admin, v_inv.user_id, 'investment_completed', 'client_investment', v_inv.id::text,
     jsonb_build_object(
       'reference', v_inv.reference,
       'principal', v_inv.principal,
       'product_version_id', v_inv.product_version_id,
       'configured_profit', v_configured_profit,
       'profit_before_completion', v_inv.profit_amount,
       'profit_ledger_before_completion', v_ledger_profit,
       'profit_ledger_direction_missing', v_unknown_ledger_direction,
       'profit_posted', v_configured_profit is not null and v_configured_profit > 0
         and v_inv.profit_amount = 0 and v_ledger_profit = 0 and not v_unknown_ledger_direction,
       'reason', trim(p_reason)
     ));
  return 'completed';
end
$function$;

-- 8b. No profit changes on a voided historical record.
create or replace function public.admin_set_investment_profit(p_investment_id uuid, p_new_profit numeric, p_reason text, p_idempotency_key text)
 returns investment_profit_adjustments
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_inv client_investments%rowtype;
  v_acct accounts%rowtype;
  v_adj investment_profit_adjustments%rowtype;
  v_delta numeric; v_tx uuid;
begin
  perform public._require_admin();
  if v_key is null then raise exception 'Invalid request'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  if p_new_profit is null or p_new_profit <> round(p_new_profit, 2) then raise exception 'Enter an amount with at most 2 decimal places'; end if;

  select * into v_inv from client_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_inv.historical_voided_at is not null then raise exception 'This historical record was voided'; end if;

  select * into v_adj from investment_profit_adjustments where investment_id = v_inv.id and idempotency_key = v_key;
  if found then return v_adj; end if;

  if v_inv.status not in ('active', 'completed', 'matured') then
    raise exception 'Profit can only be set on an active or completed investment';
  end if;
  if p_new_profit < -v_inv.principal then raise exception 'A loss cannot exceed the principal'; end if;
  v_delta := p_new_profit - v_inv.profit_amount;
  if v_delta = 0 then raise exception 'The new profit is the same as the current profit'; end if;

  select * into v_acct from accounts where user_id = v_inv.user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if v_acct.profit_balance + v_delta < 0 then
    raise exception 'The client''s profit balance cannot cover this reduction';
  end if;

  update accounts set profit_balance = profit_balance + v_delta,
         account_balance = greatest(account_balance + v_delta, 0), updated_at = now()
   where user_id = v_inv.user_id;
  update client_investments set profit_amount = p_new_profit, updated_at = now() where id = v_inv.id;

  insert into transactions (user_id, type, method, amount, direction, status, reference, notes, idempotency_key)
  values (v_inv.user_id, 'return', 'profit_balance', abs(v_delta), case when v_delta > 0 then 'credit' else 'debit' end, 'completed',
          coalesce(v_inv.reference, 'INV') || '-R' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          trim(p_reason), 'inv-profit:' || v_inv.id || ':' || v_key)
  returning id into v_tx;
  insert into investment_transactions (client_investment_id, transaction_id, kind) values (v_inv.id, v_tx, 'return');

  insert into investment_profit_adjustments (investment_id, client_id, admin_id, previous_profit, new_profit, previous_value, new_value, reason, transaction_id, idempotency_key)
  values (v_inv.id, v_inv.user_id, v_admin, v_inv.profit_amount, p_new_profit,
          v_inv.principal + v_inv.profit_amount, v_inv.principal + p_new_profit, trim(p_reason), v_tx, v_key)
  returning * into v_adj;

  perform public._inv_event(v_inv.id, v_inv.status, v_inv.status, v_admin,
    'Profit / return set from ' || to_char(v_inv.profit_amount, 'FM999999990.00') || ' to ' || to_char(p_new_profit, 'FM999999990.00'));

  insert into audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_inv.user_id, 'investment_profit_adjusted', 'client_investment', v_inv.id::text,
          jsonb_build_object('reference', v_inv.reference, 'adjustment_id', v_adj.id, 'transaction_id', v_tx,
                             'previous_profit', v_adj.previous_profit, 'new_profit', v_adj.new_profit,
                             'previous_value', v_adj.previous_value, 'new_value', v_adj.new_value,
                             'previous_profit_balance', v_acct.profit_balance, 'new_profit_balance', v_acct.profit_balance + v_delta,
                             'reason', trim(p_reason)));
  return v_adj;
end $function$;

-- 8c. Status notifications describe money movements ("principal returned to
--     your available balance") that never happen for a historical record.
create or replace function public._notify_investment_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_title text; v_body text; v_ref text := coalesce(new.reference, 'your investment');
begin
  if new.status = old.status then return new; end if;
  if new.is_historical then return new; end if;
  select name into v_name from public.investment_product_versions where id = new.product_version_id;
  v_name := coalesce(v_name, 'Investment');
  if new.status = 'active' and old.status in ('pending_activation', 'approved') then
    v_title := 'Investment approved';
    v_body := v_ref || ' (' || v_name || ') has been approved and is now active.';
  elsif new.status = 'rejected' then
    v_title := 'Investment request rejected';
    v_body := v_ref || ' (' || v_name || ') was not approved. The held amount is back in your available balance.'
              || coalesce(' Reason: ' || left(new.rejection_reason, 400), '');
  elsif new.status = 'completed' then
    v_title := 'Investment completed';
    v_body := v_ref || ' (' || v_name || ') has been completed and the principal returned to your available balance.';
  elsif new.status = 'expired' then
    v_title := 'Investment request expired';
    v_body := v_ref || ' (' || v_name || ') expired before it was processed. The held amount is back in your available balance.';
  else
    return new;
  end if;
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, investment_id)
  values (new.user_id, 'investment', v_title, v_body, 'View investment', '#investments', new.id);
  return new;
end $function$;

-- 8d. Client totals leave out a voided historical record.
create or replace function public.client_investment_summary()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
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
  where user_id = auth.uid() and historical_voided_at is null
$function$;

-- 8e. Reconciliation leaves out a voided historical record. A recorded active
--     historical investment is still compared with the invested balance, so a
--     ledger difference it reveals is reported here, never fixed silently.
create or replace function public.admin_reconciliation()
 returns table(user_id uuid, full_name text, check_name text, expected numeric, actual numeric, difference numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
    from client_investments ci where ci.historical_voided_at is null group by ci.user_id
  ), inv_ledger as (
    select ci.id, ci.user_id, ci.profit_amount,
           coalesce(sum(case when t.direction = 'debit' then -t.amount else t.amount end) filter (where it.kind = 'return' and t.status = 'completed'), 0) as ledger
    from client_investments ci
    left join investment_transactions it on it.client_investment_id = ci.id
    left join transactions t on t.id = it.transaction_id
    where ci.historical_voided_at is null
    group by ci.id, ci.user_id, ci.profit_amount
  )
  select a.user_id, a.full_name, 'total_vs_parts'::text,
         (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance), a.account_balance,
         a.account_balance - (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  from a where a.account_balance <> (a.available_balance + a.invested_balance + a.pending_balance + a.profit_balance)
  union all
  select a.user_id, a.full_name, 'negative_balance', 0::numeric,
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance),
         least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance)
  from a where least(a.account_balance, a.available_balance, a.invested_balance, a.pending_balance, a.profit_balance) < 0
  union all
  select a.user_id, a.full_name, 'pending_investments_not_held', h.pending_inv, a.pending_balance, a.pending_balance - h.pending_inv
  from a join holds h on h.user_id = a.user_id where a.pending_balance < h.pending_inv
  union all
  select a.user_id, a.full_name, 'active_investments_not_invested', h.active_inv, a.invested_balance, a.invested_balance - h.active_inv
  from a join holds h on h.user_id = a.user_id where a.invested_balance < h.active_inv
  union all
  select l.user_id, p.full_name, 'investment_profit_vs_ledger', l.ledger, l.profit_amount, l.profit_amount - l.ledger
  from inv_ledger l left join profiles p on p.id = l.user_id where l.profit_amount <> l.ledger;
end $function$;

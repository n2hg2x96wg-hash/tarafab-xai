-- Investment products: steps 1-3 of docs/investment-architecture.md.
--
-- Additive only. Creates new, empty tables and admin functions for managing
-- products. Nothing here reads or writes public.accounts or
-- public.transactions, and there is deliberately NO function that creates a
-- client investment or moves money: that is step 4, which needs separate
-- approval. client_investments and investment_transactions exist so the
-- schema and its security rules are in place, but nothing can write to them.

/* ---------- products and their versioned terms ---------- */

create table public.investment_products (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status             text not null default 'draft'
                     check (status in ('draft', 'under_review', 'active', 'suspended', 'closed')),
  current_version_id uuid,
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.investment_product_versions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.investment_products(id) on delete restrict,
  version         int  not null check (version > 0),
  name            text not null check (length(trim(name)) between 2 and 120),
  description     text not null check (length(trim(description)) between 10 and 4000),
  currency        text not null default 'USD' check (currency = 'USD'),
  min_amount      numeric(20,2) not null check (min_amount > 0),
  max_amount      numeric(20,2) check (max_amount is null or max_amount >= min_amount),
  term_days       int check (term_days is null or term_days between 1 and 3650),
  risk_level      text not null check (risk_level in ('low', 'medium', 'high')),
  risk_disclosure text not null check (length(trim(risk_disclosure)) >= 20),
  terms_text      text not null check (length(trim(terms_text)) >= 20),
  entry_fee_pct   numeric(6,4) not null default 0 check (entry_fee_pct >= 0 and entry_fee_pct < 1),
  -- How a return is defined. 'none' means the product states no return; the
  -- app never calculates one. A fixed rate is only a stated term, not a promise
  -- the app acts on: no return is ever credited automatically.
  return_type     text not null default 'none' check (return_type in ('none', 'fixed_rate')),
  return_rate_pct numeric(8,4) check (return_rate_pct is null or return_rate_pct >= 0),
  eligibility     jsonb not null default '{"kyc_required": true}'::jsonb,
  published_at    timestamptz,
  published_by    uuid references auth.users(id),
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (product_id, version),
  check (return_type <> 'fixed_rate' or (return_rate_pct is not null and term_days is not null)),
  check (return_type <> 'none' or return_rate_pct is null)
);

alter table public.investment_products
  add constraint investment_products_current_version_fkey
  foreign key (current_version_id) references public.investment_product_versions(id) on delete restrict;

create index investment_product_versions_product_idx on public.investment_product_versions (product_id, version desc);

-- Published terms are permanent: a client investment always points at the
-- exact terms that were shown, so they can never change underneath it.
create or replace function public._investment_version_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then raise exception 'Published terms cannot be deleted'; end if;
    return old;
  end if;
  if old.published_at is not null then
    raise exception 'Published terms cannot be changed; create a new version instead';
  end if;
  return new;
end $$;

create trigger investment_version_guard
  before update or delete on public.investment_product_versions
  for each row execute function public._investment_version_guard();

/* ---------- client positions (no writer exists yet: step 4) ---------- */

create table public.client_investments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete restrict,
  account_id         uuid not null references public.accounts(id) on delete restrict,
  product_id         uuid not null references public.investment_products(id) on delete restrict,
  product_version_id uuid not null references public.investment_product_versions(id) on delete restrict,
  principal          numeric(20,2) not null check (principal > 0),
  fee_amount         numeric(20,2) not null default 0 check (fee_amount >= 0),
  currency           text not null default 'USD' check (currency = 'USD'),
  status             text not null check (status in
                       ('pending_activation', 'active', 'matured', 'closed', 'cancelled', 'rejected')),
  start_date         timestamptz,
  maturity_date      timestamptz,
  terms_accepted_at  timestamptz not null,
  idempotency_key    text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index client_investments_user_idx on public.client_investments (user_id, created_at desc);
create index client_investments_status_idx on public.client_investments (status, created_at desc);
create index client_investments_product_idx on public.client_investments (product_id);

-- Links investments to rows in the existing ledger (public.transactions).
create table public.investment_transactions (
  id                   uuid primary key default gen_random_uuid(),
  client_investment_id uuid not null references public.client_investments(id) on delete restrict,
  transaction_id       uuid not null unique references public.transactions(id) on delete restrict,
  kind                 text not null check (kind in ('principal_in', 'fee', 'return', 'principal_out', 'cancellation_refund')),
  created_at           timestamptz not null default now()
);
create index investment_transactions_inv_idx on public.investment_transactions (client_investment_id);

-- Status history. Append-only.
create table public.client_investment_events (
  id                   bigint generated always as identity primary key,
  client_investment_id uuid not null references public.client_investments(id) on delete restrict,
  from_status          text,
  to_status            text not null,
  actor_id             uuid references auth.users(id),
  reason               text,
  created_at           timestamptz not null default now()
);
create index client_investment_events_inv_idx on public.client_investment_events (client_investment_id, created_at);

create or replace function public._append_only()
returns trigger language plpgsql as $$
begin raise exception 'This history cannot be changed'; end $$;

create trigger client_investment_events_append_only
  before update or delete on public.client_investment_events
  for each row execute function public._append_only();

/* ---------- row level security ---------- */

alter table public.investment_products enable row level security;
alter table public.investment_product_versions enable row level security;
alter table public.client_investments enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.client_investment_events enable row level security;

-- Clients see active products, and the products behind their own investments.
create policy inv_products_select on public.investment_products for select using (
  public.is_admin()
  or status = 'active'
  or exists (select 1 from public.client_investments ci where ci.product_id = investment_products.id and ci.user_id = (select auth.uid()))
);

-- Clients see published terms of active products, and the exact version
-- behind any investment of their own. Drafts are admin-only.
create policy inv_versions_select on public.investment_product_versions for select using (
  public.is_admin()
  or (published_at is not null and exists (
        select 1 from public.investment_products p where p.id = product_id and p.status = 'active' and p.current_version_id = investment_product_versions.id))
  or exists (select 1 from public.client_investments ci where ci.product_version_id = investment_product_versions.id and ci.user_id = (select auth.uid()))
);

create policy client_investments_select on public.client_investments for select using (
  user_id = (select auth.uid()) or public.is_admin()
);
create policy investment_transactions_select on public.investment_transactions for select using (
  public.is_admin() or exists (
    select 1 from public.client_investments ci where ci.id = client_investment_id and ci.user_id = (select auth.uid()))
);
create policy client_investment_events_select on public.client_investment_events for select using (
  public.is_admin() or exists (
    select 1 from public.client_investments ci where ci.id = client_investment_id and ci.user_id = (select auth.uid()))
);
-- No INSERT / UPDATE / DELETE policy on any of these tables, for anyone.
-- Every write goes through the security-definer functions below.

grant select on public.investment_products, public.investment_product_versions,
  public.client_investments, public.investment_transactions, public.client_investment_events to authenticated;

/* ---------- admin: product management (no money movement) ---------- */

-- Create a product with its first draft, or save changes to a product's
-- unpublished draft (creating a new draft version if the latest is published).
create or replace function public.admin_save_product_draft(
  p_product_id uuid, p_code text, p_name text, p_description text,
  p_min_amount numeric, p_max_amount numeric, p_term_days int, p_risk_level text,
  p_risk_disclosure text, p_terms_text text, p_entry_fee_pct numeric,
  p_return_type text, p_return_rate_pct numeric, p_kyc_required boolean
) returns public.investment_product_versions
language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_product public.investment_products; v_ver public.investment_product_versions; v_next int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;

  if p_product_id is null then
    insert into public.investment_products (code, created_by)
    values (lower(trim(p_code)), v_admin) returning * into v_product;
  else
    select * into v_product from public.investment_products where id = p_product_id for update;
    if not found then raise exception 'Product not found'; end if;
    if v_product.status = 'closed' then raise exception 'A closed product cannot be edited'; end if;
  end if;

  select * into v_ver from public.investment_product_versions
    where product_id = v_product.id order by version desc limit 1;

  if found and v_ver.published_at is null then
    update public.investment_product_versions set
      name = trim(p_name), description = trim(p_description),
      min_amount = round(p_min_amount, 2), max_amount = round(p_max_amount, 2),
      term_days = p_term_days, risk_level = p_risk_level,
      risk_disclosure = trim(p_risk_disclosure), terms_text = trim(p_terms_text),
      entry_fee_pct = coalesce(p_entry_fee_pct, 0), return_type = coalesce(p_return_type, 'none'),
      return_rate_pct = p_return_rate_pct,
      eligibility = jsonb_build_object('kyc_required', coalesce(p_kyc_required, true))
    where id = v_ver.id returning * into v_ver;
  else
    v_next := coalesce(v_ver.version, 0) + 1;
    insert into public.investment_product_versions (
      product_id, version, name, description, min_amount, max_amount, term_days, risk_level,
      risk_disclosure, terms_text, entry_fee_pct, return_type, return_rate_pct, eligibility, created_by
    ) values (
      v_product.id, v_next, trim(p_name), trim(p_description), round(p_min_amount, 2), round(p_max_amount, 2),
      p_term_days, p_risk_level, trim(p_risk_disclosure), trim(p_terms_text), coalesce(p_entry_fee_pct, 0),
      coalesce(p_return_type, 'none'), p_return_rate_pct,
      jsonb_build_object('kyc_required', coalesce(p_kyc_required, true)), v_admin
    ) returning * into v_ver;
  end if;

  update public.investment_products set updated_at = now() where id = v_product.id;

  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_draft_saved', 'investment_product', v_product.id::text,
          jsonb_build_object('version', v_ver.version, 'version_id', v_ver.id, 'name', v_ver.name));
  return v_ver;
end $$;

-- Publishing freezes a draft's terms and makes them the product's current terms.
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
  update public.investment_products set current_version_id = p_version_id, updated_at = now()
    where id = v_ver.product_id;

  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_version_published', 'investment_product', v_ver.product_id::text,
          jsonb_build_object('version', v_ver.version, 'version_id', v_ver.id));
  return v_ver;
end $$;

-- Status changes need a reason. A product can only become active with
-- published terms, and a closed product stays closed.
create or replace function public.admin_set_investment_product_status(p_product_id uuid, p_status text, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_product public.investment_products;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('draft', 'under_review', 'active', 'suspended', 'closed') then raise exception 'Unknown status'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into v_product from public.investment_products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_product.status = 'closed' then raise exception 'A closed product cannot be reopened'; end if;
  if p_status = 'active' and v_product.current_version_id is null then
    raise exception 'Publish the terms before making the product active';
  end if;

  update public.investment_products set status = p_status, updated_at = now() where id = p_product_id;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'investment_product_status', 'investment_product', p_product_id::text,
          jsonb_build_object('from', v_product.status, 'to', p_status, 'reason', trim(p_reason)));
  return p_status;
end $$;

revoke all on function public.admin_save_product_draft(uuid, text, text, text, numeric, numeric, int, text, text, text, numeric, text, numeric, boolean) from public, anon;
revoke all on function public.admin_publish_product_version(uuid) from public, anon;
revoke all on function public.admin_set_investment_product_status(uuid, text, text) from public, anon;
revoke all on function public._investment_version_guard() from public, anon;
revoke all on function public._append_only() from public, anon;
grant execute on function public.admin_save_product_draft(uuid, text, text, text, numeric, numeric, int, text, text, text, numeric, text, numeric, boolean) to authenticated;
grant execute on function public.admin_publish_product_version(uuid) to authenticated;
grant execute on function public.admin_set_investment_product_status(uuid, text, text) to authenticated;

-- Card Center: card design previews, a fixed card-application fee paid from
-- the existing wallet (accounts.available_balance), and admin controls.
--
-- Additive only: four new tables and new functions. No existing table, row,
-- balance or function is changed. Paid applications are closed until an
-- admin sets a fee, the terms (incl. refund/cancellation policy) and the
-- issuing partner, and opens them; no fee is set here.
--
-- A paid application is created only by client_card_apply, which in one
-- transaction re-checks eligibility, deducts the fee once from
-- available_balance, writes one 'fee' ledger row and the linked application.
-- Changing an application's status never moves money.
--
-- Rollback: drop the functions and tables below (no other object depends on them).
--
-- Status: applied to the database, but no client or admin screen uses it yet
-- (the Card Center UI was held back from release). Applications are closed
-- and no fee is set, so these objects are dormant.

create table if not exists public.card_designs (
  id text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  name text not null check (length(name) between 2 and 40),
  base_color text not null check (base_color ~ '^#[0-9a-fA-F]{6}$'),
  enabled boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_settings (
  id integer primary key default 1 check (id = 1),
  fee numeric(12,2) check (fee is null or (fee > 0 and fee <= 100000)),
  currency text not null default 'USD' check (currency = 'USD'),
  applications_open boolean not null default false,
  terms text,
  issuer_name text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (not applications_open or (fee is not null and length(coalesce(terms, '')) >= 40 and length(coalesce(issuer_name, '')) >= 2))
);

create table if not exists public.card_preferences (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  design_id text not null references public.card_designs(id),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  nickname text check (nickname is null or length(nickname) <= 24),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  design_id text not null references public.card_designs(id),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  nickname text check (nickname is null or length(nickname) <= 24),
  fee numeric(12,2) not null check (fee > 0),
  currency text not null check (currency = 'USD'),
  -- Every paid application is linked to exactly one completed fee debit.
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  status text not null default 'paid_submitted'
    check (status in ('paid_submitted', 'under_review', 'approved', 'rejected', 'issued', 'cancelled')),
  terms_snapshot text not null,
  issuer_name text,
  issuer_reference text,
  admin_note text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (status <> 'issued' or (issuer_name is not null and issuer_reference is not null))
);
-- One active application per client (concurrent requests cannot bypass it).
create unique index if not exists card_applications_one_active
  on public.card_applications (user_id) where status in ('paid_submitted', 'under_review', 'approved', 'issued');

alter table public.card_designs enable row level security;
alter table public.card_settings enable row level security;
alter table public.card_preferences enable row level security;
alter table public.card_applications enable row level security;
-- No direct table access for clients or visitors: everything goes through the
-- functions below (which never return admin notes to clients).
revoke all on public.card_designs, public.card_settings, public.card_preferences, public.card_applications from anon, authenticated;

insert into public.card_settings (id) values (1) on conflict (id) do nothing;
insert into public.card_designs (id, name, base_color, sort) values
  ('gold', 'Gold Reserve', '#C8962E', 1),
  ('onyx', 'Onyx', '#1B1E25', 2),
  ('aurora', 'Aurora', '#2B5B84', 3),
  ('platinum', 'Platinum', '#8A8F98', 4)
on conflict (id) do nothing;

-- Spendable wallet balance: available balance less withdrawals from it that
-- are still pending (they are reserved until completed or rejected).
create or replace function public._card_spendable(p_uid uuid)
returns numeric language sql stable security definer set search_path to 'public' as $function$
  select greatest(coalesce((select available_balance from public.accounts where user_id = p_uid), 0)
    - coalesce((select sum(amount) from public.transactions where user_id = p_uid and type = 'withdrawal' and method = 'available_balance'
        and status in ('pending_review', 'pending', 'requested', 'under_review', 'approved', 'processing')), 0), 0)
$function$;
revoke all on function public._card_spendable(uuid) from public, anon, authenticated;

create or replace function public._card_clean_nickname(p text)
returns text language sql immutable set search_path to 'public' as $function$
  select nullif(left(regexp_replace(trim(coalesce(p, '')), '[^A-Za-z0-9 .''&-]', '', 'g'), 24), '')
$function$;

-- Client: everything the Card Center shows, for the signed-in client only.
create or replace function public.client_card_center()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); s public.card_settings; r jsonb;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into s from public.card_settings where id = 1;
  select jsonb_build_object(
    'designs', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'base_color', d.base_color) order by d.sort, d.name)
                         from public.card_designs d where d.enabled), '[]'::jsonb),
    'settings', jsonb_build_object('fee', s.fee, 'currency', s.currency, 'open', coalesce(s.applications_open, false),
                                   'terms', case when s.applications_open then s.terms end, 'issuer_name', case when s.applications_open then s.issuer_name end),
    'preference', (select jsonb_build_object('design_id', p.design_id, 'design_name', (select d.name from public.card_designs d where d.id = p.design_id), 'color', p.color, 'nickname', p.nickname,
                          'design_available', coalesce((select d.enabled from public.card_designs d where d.id = p.design_id), false))
                   from public.card_preferences p where p.user_id = v_uid),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('reference', a.reference, 'status', a.status,
                          'design_name', d.name, 'color', a.color, 'nickname', a.nickname, 'fee', a.fee, 'currency', a.currency,
                          'issuer_name', case when a.status = 'issued' then a.issuer_name end,
                          'created_at', a.created_at, 'updated_at', a.updated_at) order by a.created_at desc)
                   from public.card_applications a join public.card_designs d on d.id = a.design_id where a.user_id = v_uid), '[]'::jsonb),
    'has_active', exists (select 1 from public.card_applications a where a.user_id = v_uid and a.status in ('paid_submitted', 'under_review', 'approved', 'issued')),
    'spendable', public._card_spendable(v_uid)
  ) into r;
  return r;
end $function$;

-- Client: save the preview (design, colour, nickname). No money, no card.
create or replace function public.client_card_save_preference(p_design text, p_color text, p_nickname text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_nick text := public._card_clean_nickname(p_nickname);
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if not exists (select 1 from public.card_designs where id = p_design and enabled) then raise exception 'This card design is not available. Choose another design.'; end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Choose a card colour.'; end if;
  insert into public.card_preferences (user_id, design_id, color, nickname, updated_at) values (v_uid, p_design, lower(p_color), v_nick, now())
  on conflict (user_id) do update set design_id = excluded.design_id, color = excluded.color, nickname = excluded.nickname, updated_at = now();
  return jsonb_build_object('design_id', p_design, 'color', lower(p_color), 'nickname', v_nick);
end $function$;

-- Client: pay the fixed fee and submit one card application, atomically.
create or replace function public.client_card_apply(p_design text, p_color text, p_nickname text, p_expected_fee numeric, p_accept_terms boolean, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_key text := public._check_idempotency_key(p_idempotency_key);
  s public.card_settings; v_acc public.accounts; a public.card_applications; v_spend numeric; v_ref text; v_tx uuid; v_nick text := public._card_clean_nickname(p_nickname);
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if v_key is null then raise exception 'Invalid request key'; end if;
  -- A repeated submit (double tap, retry, refresh) returns the original application.
  select * into a from public.card_applications where user_id = v_uid and idempotency_key = v_key;
  if found then return jsonb_build_object('reference', a.reference, 'status', a.status, 'fee', a.fee, 'currency', a.currency, 'repeated', true); end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then raise exception 'Your account is suspended. Contact support.'; end if;
  select * into s from public.card_settings where id = 1 for share;
  if not coalesce(s.applications_open, false) or s.fee is null then raise exception 'Card applications are not open at the moment.'; end if;
  if p_expected_fee is null or round(p_expected_fee, 2) <> s.fee then raise exception 'The card fee has changed. Review the new amount before you confirm.'; end if;
  if p_accept_terms is not true then raise exception 'Please accept the card application terms.'; end if;
  if not exists (select 1 from public.card_designs where id = p_design and enabled) then raise exception 'This card design is not available. Choose another design.'; end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Choose a card colour.'; end if;
  -- Serialise this client's money movements.
  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  select * into a from public.card_applications where user_id = v_uid and idempotency_key = v_key;
  if found then return jsonb_build_object('reference', a.reference, 'status', a.status, 'fee', a.fee, 'currency', a.currency, 'repeated', true); end if;
  if exists (select 1 from public.card_applications where user_id = v_uid and status in ('paid_submitted', 'under_review', 'approved', 'issued')) then
    raise exception 'You already have an active card application.';
  end if;
  v_spend := public._card_spendable(v_uid);
  if v_spend < s.fee then
    raise exception 'Insufficient available balance. Fee: % %, available: % %, short by % %.',
      to_char(s.fee, 'FM999,999,990.00'), s.currency, to_char(v_spend, 'FM999,999,990.00'), s.currency, to_char(s.fee - v_spend, 'FM999,999,990.00'), s.currency;
  end if;
  v_ref := 'CRD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update public.accounts set available_balance = round(available_balance - s.fee, 2), updated_at = now() where user_id = v_uid;
  insert into public.transactions (user_id, type, method, amount, status, reference, notes, direction, idempotency_key)
  values (v_uid, 'fee', 'available_balance', s.fee, 'completed', v_ref, 'Card application fee', 'debit', 'card-fee:' || v_key)
  returning id into v_tx;
  insert into public.card_applications (reference, user_id, design_id, color, nickname, fee, currency, transaction_id, terms_snapshot, idempotency_key)
  values (v_ref, v_uid, p_design, lower(p_color), v_nick, s.fee, s.currency, v_tx, s.terms, v_key)
  returning * into a;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'card_application_paid', 'card_application', a.id::text,
          jsonb_build_object('reference', v_ref, 'fee', s.fee, 'currency', s.currency, 'transaction_id', v_tx, 'design_id', p_design,
                             'previous_available', v_acc.available_balance, 'new_available', round(v_acc.available_balance - s.fee, 2)));
  return jsonb_build_object('reference', a.reference, 'status', a.status, 'fee', a.fee, 'currency', a.currency, 'repeated', false);
end $function$;

-- Admin: settings, designs and application counts.
create or replace function public.admin_card_overview()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare s public.card_settings;
begin
  perform public._require_admin();
  select * into s from public.card_settings where id = 1;
  return jsonb_build_object(
    'settings', jsonb_build_object('fee', s.fee, 'currency', s.currency, 'open', s.applications_open, 'terms', s.terms, 'issuer_name', s.issuer_name, 'updated_at', s.updated_at),
    'designs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'base_color', base_color, 'enabled', enabled) order by sort, name) from public.card_designs), '[]'::jsonb),
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.card_applications group by status) x), '{}'::jsonb));
end $function$;

create or replace function public.admin_card_set_settings(p_fee numeric, p_open boolean, p_terms text, p_issuer_name text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_admin uuid := auth.uid(); old public.card_settings; new_s public.card_settings;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p_fee is not null and (p_fee <= 0 or p_fee > 100000) then raise exception 'Enter a fee greater than zero.'; end if;
  if coalesce(p_open, false) then
    if p_fee is null then raise exception 'Set the fee before opening applications.'; end if;
    if length(trim(coalesce(p_terms, ''))) < 40 then raise exception 'Add the application terms, including the cancellation and refund policy, before opening applications.'; end if;
    if length(trim(coalesce(p_issuer_name, ''))) < 2 then raise exception 'Name the card issuing partner before opening applications.'; end if;
  end if;
  select * into old from public.card_settings where id = 1 for update;
  update public.card_settings set fee = round(p_fee, 2), applications_open = coalesce(p_open, false), terms = nullif(trim(coalesce(p_terms, '')), ''),
    issuer_name = nullif(trim(coalesce(p_issuer_name, '')), ''), updated_at = now(), updated_by = v_admin where id = 1 returning * into new_s;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, 'card_settings_updated', 'card_settings', '1', jsonb_build_object('reason', trim(p_reason),
    'previous', jsonb_build_object('fee', old.fee, 'open', old.applications_open, 'issuer_name', old.issuer_name),
    'new', jsonb_build_object('fee', new_s.fee, 'open', new_s.applications_open, 'issuer_name', new_s.issuer_name)));
  return public.admin_card_overview();
end $function$;

create or replace function public.admin_card_set_design(p_id text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_admin uuid := auth.uid();
begin
  perform public._require_admin();
  update public.card_designs set enabled = coalesce(p_enabled, false), updated_at = now() where id = p_id;
  if not found then raise exception 'Card design not found'; end if;
  insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
  values (v_admin, v_admin, case when p_enabled then 'card_design_enabled' else 'card_design_disabled' end, 'card_design', p_id, '{}'::jsonb);
  return public.admin_card_overview();
end $function$;

create or replace function public.admin_card_applications(p_status text default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public._require_admin();
  return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
    select a.id, a.reference, a.user_id, coalesce(p.full_name, '') as client_name, u.email as client_email, a.status,
           a.design_id, d.name as design_name, a.color, a.nickname, a.fee, a.currency, t.reference as payment_reference,
           a.issuer_name, a.issuer_reference, a.admin_note, a.created_at, a.updated_at
      from public.card_applications a
      join public.card_designs d on d.id = a.design_id
      join public.transactions t on t.id = a.transaction_id
      left join public.profiles p on p.id = a.user_id
      left join auth.users u on u.id = a.user_id
     where p_status is null or a.status = p_status
     order by a.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x), '[]'::jsonb);
end $function$;

-- Admin: move an application through review. Never moves money; "issued"
-- requires a configured issuing partner and that partner's issuance reference.
create or replace function public.admin_card_set_status(p_id uuid, p_status text, p_note text, p_issuer_reference text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_admin uuid := auth.uid(); a public.card_applications; v_issuer text; ok boolean;
begin
  perform public._require_admin();
  select * into a from public.card_applications where id = p_id for update;
  if not found then raise exception 'Application not found'; end if;
  ok := (a.status = 'paid_submitted' and p_status in ('under_review', 'approved', 'rejected'))
     or (a.status = 'under_review' and p_status in ('approved', 'rejected'))
     or (a.status = 'approved' and p_status in ('issued', 'rejected'));
  if not ok then raise exception 'This application cannot move from % to %.', a.status, p_status; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Give a reason for the rejection.'; end if;
  if p_status = 'issued' then
    select issuer_name into v_issuer from public.card_settings where id = 1;
    if v_issuer is null then raise exception 'No card issuing partner is configured.'; end if;
    if coalesce(trim(p_issuer_reference), '') !~ '^[A-Za-z0-9_./:-]{4,80}$' then raise exception 'Enter the issuing partner''s reference for this card.'; end if;
  end if;
  update public.card_applications set status = p_status, admin_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), admin_note),
    issuer_name = case when p_status = 'issued' then v_issuer else issuer_name end,
    issuer_reference = case when p_status = 'issued' then trim(p_issuer_reference) else issuer_reference end,
    updated_at = now() where id = p_id returning * into a;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, a.user_id, 'card_application_' || p_status, 'card_application', a.id::text,
          jsonb_build_object('reference', a.reference, 'status', p_status, 'note', nullif(trim(coalesce(p_note, '')), ''), 'issuer_reference', a.issuer_reference));
  return jsonb_build_object('id', a.id, 'reference', a.reference, 'status', a.status);
end $function$;

revoke all on function public.client_card_center(), public.client_card_save_preference(text, text, text),
  public.client_card_apply(text, text, text, numeric, boolean, text), public.admin_card_overview(),
  public.admin_card_set_settings(numeric, boolean, text, text, text), public.admin_card_set_design(text, boolean),
  public.admin_card_applications(text, integer), public.admin_card_set_status(uuid, text, text, text),
  public._card_clean_nickname(text) from public, anon;
grant execute on function public.client_card_center(), public.client_card_save_preference(text, text, text),
  public.client_card_apply(text, text, text, numeric, boolean, text), public.admin_card_overview(),
  public.admin_card_set_settings(numeric, boolean, text, text, text), public.admin_card_set_design(text, boolean),
  public.admin_card_applications(text, integer), public.admin_card_set_status(uuid, text, text, text) to authenticated;

-- Bank-transfer withdrawals to saved, country-specific bank accounts.
--
-- Additive and backward compatible:
-- * new table client_bank_accounts (no existing table or row is changed);
-- * new nullable column transactions.bank_account_id (null for every
--   existing and every crypto withdrawal);
-- * new functions; admin_review_transaction gains two checks that apply
--   only to bank withdrawals (crypto approvals behave exactly as before);
-- * new system_settings row 'bank_withdrawals'.
--
-- No payout provider is configured (system_settings.payout_rail is
-- disabled), so bank withdrawals use the existing manual workflow: the client
-- requests (status pending_review, balance held through the pending sum), an
-- admin verifies the bank account, sends the transfer outside the platform,
-- then approves with the bank payment reference (status completed, balance
-- deducted once) or rejects (nothing deducted). Nothing here marks a payout
-- completed by itself.
--
-- Bank identifiers (account number, IBAN, routing data) are encrypted with a
-- key kept in Supabase Vault. Clients can read only masked columns of their
-- own rows; full details are released only to admins through
-- admin_bank_account_details, which records who looked and why. Audit
-- records never contain full identifiers.

-- ---------------------------------------------------------------- key
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bank_details_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bank_details_key',
      'Encrypts saved client bank account details (client_bank_accounts.details_enc)');
  end if;
end $$;

create or replace function public._bank_key()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bank_details_key' limit 1
$$;
revoke all on function public._bank_key() from public, anon, authenticated;

-- ---------------------------------------------------------------- settings
insert into public.system_settings (key, value, updated_at)
values ('bank_withdrawals', jsonb_build_object(
  'enabled', true,
  'mode', 'manual',
  'routes', jsonb_build_array('us_ach', 'gb_fps', 'ca_eft', 'au_bsb', 'sepa')
), now())
on conflict (key) do nothing;

-- ---------------------------------------------------------------- table
create table if not exists public.client_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  label text check (label is null or char_length(label) between 1 and 40),
  country text not null check (country ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  route text not null check (route in ('us_ach', 'gb_fps', 'ca_eft', 'au_bsb', 'sepa')),
  holder_name text not null check (char_length(holder_name) between 2 and 120),
  bank_name text not null check (char_length(bank_name) between 2 and 120),
  account_last4 text not null check (account_last4 ~ '^[0-9A-Z]{2,4}$'),
  details_enc bytea not null,
  fingerprint text not null,
  name_check text not null check (name_check in ('match', 'mismatch')),
  status text not null default 'pending_review' check (status in ('pending_review', 'verified', 'rejected', 'removed')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists client_bank_accounts_user_idx on public.client_bank_accounts (user_id);
create unique index if not exists client_bank_accounts_active_unique
  on public.client_bank_accounts (user_id, fingerprint) where status <> 'removed';

alter table public.client_bank_accounts enable row level security;
revoke all on table public.client_bank_accounts from anon, authenticated;
-- Masked columns only: details_enc and fingerprint are never readable directly.
grant select (id, user_id, label, country, currency, route, holder_name, bank_name, account_last4,
              name_check, status, review_note, reviewed_at, created_at, updated_at)
  on public.client_bank_accounts to authenticated;
create policy client_bank_accounts_select_own on public.client_bank_accounts
  for select to authenticated using (user_id = (select auth.uid()) and status <> 'removed');
create policy client_bank_accounts_select_admin on public.client_bank_accounts
  for select to authenticated using (public.is_admin());

alter table public.transactions add column if not exists bank_account_id uuid references public.client_bank_accounts(id);
create index if not exists transactions_bank_account_idx on public.transactions (bank_account_id) where bank_account_id is not null;

-- ---------------------------------------------------------------- validation helpers
-- Supported routes by bank country. Countries not listed are not supported.
create or replace function public._bank_route_for(p_country text, out route text, out currency text, out iban_len integer)
language sql immutable set search_path = public as $$
  select r.route, r.currency, r.iban_len from (values
    ('US', 'us_ach', 'USD', null::integer), ('GB', 'gb_fps', 'GBP', null), ('CA', 'ca_eft', 'CAD', null), ('AU', 'au_bsb', 'AUD', null),
    ('AT', 'sepa', 'EUR', 20), ('BE', 'sepa', 'EUR', 16), ('BG', 'sepa', 'EUR', 22), ('CY', 'sepa', 'EUR', 28), ('DE', 'sepa', 'EUR', 22),
    ('EE', 'sepa', 'EUR', 20), ('ES', 'sepa', 'EUR', 24), ('FI', 'sepa', 'EUR', 18), ('FR', 'sepa', 'EUR', 27), ('GR', 'sepa', 'EUR', 27),
    ('HR', 'sepa', 'EUR', 21), ('IE', 'sepa', 'EUR', 22), ('IT', 'sepa', 'EUR', 27), ('LT', 'sepa', 'EUR', 20), ('LU', 'sepa', 'EUR', 20),
    ('LV', 'sepa', 'EUR', 21), ('MT', 'sepa', 'EUR', 31), ('NL', 'sepa', 'EUR', 18), ('PT', 'sepa', 'EUR', 25), ('SI', 'sepa', 'EUR', 19),
    ('SK', 'sepa', 'EUR', 24)
  ) r(country, route, currency, iban_len)
  where r.country = upper(trim(coalesce(p_country, '')))
$$;

create or replace function public._iban_valid(p_iban text)
returns boolean language plpgsql immutable set search_path = public as $$
declare s text; d text := ''; c text; rem integer := 0; i integer;
begin
  if p_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then return false; end if;
  s := substr(p_iban, 5) || substr(p_iban, 1, 4);
  for i in 1..length(s) loop
    c := substr(s, i, 1);
    d := d || case when c ~ '[A-Z]' then (ascii(c) - 55)::text else c end;
  end loop;
  for i in 1..length(d) loop
    rem := (rem * 10 + substr(d, i, 1)::integer) % 97;
  end loop;
  return rem = 1;
end $$;

create or replace function public._aba_valid(p text)
returns boolean language sql immutable set search_path = public as $$
  select p ~ '^[0-9]{9}$' and (
    3 * (substr(p,1,1)::int + substr(p,4,1)::int + substr(p,7,1)::int)
  + 7 * (substr(p,2,1)::int + substr(p,5,1)::int + substr(p,8,1)::int)
  +     (substr(p,3,1)::int + substr(p,6,1)::int + substr(p,9,1)::int)) % 10 = 0
$$;

-- Lower-case name words (letters only) for comparing names.
create or replace function public._name_words(p text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct w order by w), '{}') from unnest(regexp_split_to_array(
    lower(regexp_replace(coalesce(p, ''), '[^[:alpha:][:space:]]', ' ', 'g')), '\s+')) w where w <> ''
$$;

-- Checks and normalises the route-specific identifiers. Messages are
-- written for clients (raised as P0001 and shown as is).
create or replace function public._bank_normalize(p_route text, p_country text, p_iban_len integer, p_details jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  acct text := regexp_replace(coalesce(p_details->>'account_number', ''), '[\s-]', '', 'g');
  v text; bic text; atype text;
begin
  if p_route = 'us_ach' then
    v := regexp_replace(coalesce(p_details->>'routing_number', ''), '[\s-]', '', 'g');
    if not public._aba_valid(v) then raise exception 'Enter a valid 9-digit ABA routing number.'; end if;
    if acct !~ '^[0-9]{4,17}$' then raise exception 'Enter a valid account number (4 to 17 digits).'; end if;
    atype := lower(coalesce(p_details->>'account_type', ''));
    if atype not in ('checking', 'savings') then raise exception 'Choose checking or savings.'; end if;
    return jsonb_build_object('routing_number', v, 'account_number', acct, 'account_type', atype);
  elsif p_route = 'gb_fps' then
    v := regexp_replace(coalesce(p_details->>'sort_code', ''), '[\s-]', '', 'g');
    if v !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit sort code.'; end if;
    if acct !~ '^[0-9]{8}$' then raise exception 'Enter a valid 8-digit account number.'; end if;
    return jsonb_build_object('sort_code', v, 'account_number', acct);
  elsif p_route = 'ca_eft' then
    v := regexp_replace(coalesce(p_details->>'institution_number', ''), '[\s-]', '', 'g');
    if v !~ '^[0-9]{3}$' then raise exception 'Enter a valid 3-digit institution number.'; end if;
    bic := regexp_replace(coalesce(p_details->>'transit_number', ''), '[\s-]', '', 'g');
    if bic !~ '^[0-9]{5}$' then raise exception 'Enter a valid 5-digit transit number.'; end if;
    if acct !~ '^[0-9]{7,12}$' then raise exception 'Enter a valid account number (7 to 12 digits).'; end if;
    return jsonb_build_object('institution_number', v, 'transit_number', bic, 'account_number', acct);
  elsif p_route = 'au_bsb' then
    v := regexp_replace(coalesce(p_details->>'bsb', ''), '[\s-]', '', 'g');
    if v !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit BSB.'; end if;
    if acct !~ '^[0-9]{5,9}$' then raise exception 'Enter a valid account number (5 to 9 digits).'; end if;
    return jsonb_build_object('bsb', v, 'account_number', acct);
  elsif p_route = 'sepa' then
    v := upper(regexp_replace(coalesce(p_details->>'iban', ''), '\s', '', 'g'));
    if left(v, 2) <> p_country then raise exception 'The IBAN must start with % for a bank account in this country.', p_country; end if;
    if length(v) <> p_iban_len or not public._iban_valid(v) then raise exception 'Enter a valid IBAN.'; end if;
    bic := upper(regexp_replace(coalesce(p_details->>'bic', ''), '\s', '', 'g'));
    if bic <> '' and bic !~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' then raise exception 'Enter a valid BIC / SWIFT code (8 or 11 characters), or leave it empty.'; end if;
    if bic <> '' and substr(bic, 5, 2) <> p_country then raise exception 'The BIC / SWIFT code must be for a bank in this country.'; end if;
    return jsonb_build_object('iban', v, 'bic', nullif(bic, ''));
  end if;
  raise exception 'Bank withdrawals to this country are not supported yet.';
end $$;

-- ---------------------------------------------------------------- client functions
-- What the bank form needs: whether the feature is on, the enabled routes,
-- and the caller's own verified legal name (to compare the account holder).
create or replace function public.client_bank_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s jsonb; v_name text;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select value into s from public.system_settings where key = 'bank_withdrawals';
  select full_legal_name into v_name from public.kyc_submissions
   where user_id = v_uid and status = 'verified' order by reviewed_at desc nulls last, created_at desc limit 1;
  return jsonb_build_object(
    'enabled', coalesce((s->>'enabled')::boolean, false),
    'mode', coalesce(s->>'mode', 'manual'),
    'routes', coalesce(s->'routes', '[]'::jsonb),
    'kyc_verified', v_name is not null,
    'legal_name', v_name);
end $$;

create or replace function public._bank_masked(a public.client_bank_accounts)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', a.id, 'label', a.label, 'country', a.country, 'currency', a.currency, 'route', a.route,
    'holder_name', a.holder_name, 'bank_name', a.bank_name, 'account_last4', a.account_last4, 'name_check', a.name_check,
    'status', a.status, 'review_note', a.review_note, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- Saves a bank account for the caller (or replaces one: p_replace_id), after
-- validating every field. A saved account starts as pending_review: it is
-- verified only by an admin review, never automatically.
create or replace function public.client_save_bank_account(
  p_country text, p_holder_name text, p_bank_name text, p_details jsonb,
  p_label text default null, p_replace_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb; r record; v_country text := upper(trim(coalesce(p_country, '')));
  v_holder text := nullif(btrim(regexp_replace(coalesce(p_holder_name, ''), '\s+', ' ', 'g')), '');
  v_bank text := nullif(btrim(regexp_replace(coalesce(p_bank_name, ''), '\s+', ' ', 'g')), '');
  v_label text := nullif(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), '');
  v_legal text; v_norm jsonb; v_id_part text; v_last4 text; v_fp text; v_check text;
  hw text[]; lw text[]; v_old public.client_bank_accounts; v_row public.client_bank_accounts;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then
    raise exception 'Your account is suspended. Contact support.';
  end if;
  select value into s from public.system_settings where key = 'bank_withdrawals';
  if not coalesce((s->>'enabled')::boolean, false) then raise exception 'Bank withdrawals are not available right now.'; end if;
  select * into r from public._bank_route_for(v_country);
  if r.route is null or not (coalesce(s->'routes', '[]'::jsonb) ? r.route) then
    raise exception 'Bank withdrawals to this country are not supported yet.';
  end if;
  select full_legal_name into v_legal from public.kyc_submissions
   where user_id = v_uid and status = 'verified' order by reviewed_at desc nulls last, created_at desc limit 1;
  if v_legal is null then raise exception 'Complete identity verification before adding a bank account.'; end if;
  if v_holder is null or char_length(v_holder) < 2 then raise exception 'Enter the account holder''s full legal name.'; end if;
  if char_length(v_holder) > 120 or v_holder ~ '[[:cntrl:]]' then raise exception 'Enter the account holder''s name as it appears at the bank.'; end if;
  if v_bank is null or char_length(v_bank) < 2 then raise exception 'Enter the bank name.'; end if;
  if char_length(v_bank) > 120 or v_bank ~ '[[:cntrl:]]' then raise exception 'Enter the bank name as it appears on your statement.'; end if;
  if v_label is not null and (char_length(v_label) > 40 or v_label ~ '[[:cntrl:]]') then raise exception 'Use 40 characters or fewer for the account nickname.'; end if;

  v_norm := public._bank_normalize(r.route, v_country, r.iban_len, coalesce(p_details, '{}'::jsonb));
  v_id_part := coalesce(v_norm->>'iban', v_norm->>'account_number');
  v_last4 := right(v_id_part, 4);
  v_fp := encode(extensions.digest(v_uid::text || '|' || r.route || '|' ||
    coalesce(v_norm->>'routing_number', v_norm->>'sort_code', v_norm->>'bsb', (v_norm->>'institution_number') || (v_norm->>'transit_number'), '') || '|' || v_id_part, 'sha256'), 'hex');

  -- The holder must be the client: the same name words, or (for names of two
  -- or more words) every word of one name in the other, which allows a
  -- missing middle name. Anything else is flagged for the admin review.
  hw := public._name_words(v_holder); lw := public._name_words(v_legal);
  v_check := case when cardinality(hw) >= 1 and hw = lw then 'match'
                  when cardinality(hw) >= 2 and cardinality(lw) >= 2 and (hw <@ lw or lw <@ hw) then 'match'
                  else 'mismatch' end;

  if p_replace_id is not null then
    select * into v_old from public.client_bank_accounts where id = p_replace_id and user_id = v_uid and status <> 'removed' for update;
    if not found then raise exception 'That bank account could not be found.'; end if;
    if exists (select 1 from public.transactions where bank_account_id = v_old.id and type = 'withdrawal'
                 and status in ('pending_review', 'pending', 'requested', 'under_review', 'approved', 'processing')) then
      raise exception 'This bank account has a withdrawal in progress. Wait until it is finished before changing it.';
    end if;
    update public.client_bank_accounts set status = 'removed', removed_at = now(), updated_at = now() where id = v_old.id;
    v_label := coalesce(v_label, v_old.label);
  end if;

  if exists (select 1 from public.client_bank_accounts where user_id = v_uid and fingerprint = v_fp and status <> 'removed') then
    raise exception 'This bank account is already saved.';
  end if;
  if (select count(*) from public.client_bank_accounts where user_id = v_uid and status <> 'removed') >= 10 then
    raise exception 'You can save up to 10 bank accounts. Remove one to add another.';
  end if;

  insert into public.client_bank_accounts (user_id, label, country, currency, route, holder_name, bank_name, account_last4,
    details_enc, fingerprint, name_check, status)
  values (v_uid, v_label, v_country, r.currency, r.route, v_holder, v_bank, v_last4,
    extensions.pgp_sym_encrypt(v_norm::text, public._bank_key()), v_fp, v_check, 'pending_review')
  returning * into v_row;

  perform public._audit(case when p_replace_id is null then 'bank_account_added' else 'bank_account_replaced' end,
    v_uid, 'client_bank_accounts', v_row.id::text,
    jsonb_build_object('country', v_country, 'route', r.route, 'last4', v_last4, 'name_check', v_check, 'replaced', p_replace_id));
  return public._bank_masked(v_row);
end $$;

create or replace function public.client_rename_bank_account(p_id uuid, p_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_label text := nullif(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), ''); v_row public.client_bank_accounts;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if v_label is not null and (char_length(v_label) > 40 or v_label ~ '[[:cntrl:]]') then raise exception 'Use 40 characters or fewer for the account nickname.'; end if;
  update public.client_bank_accounts set label = v_label, updated_at = now()
   where id = p_id and user_id = v_uid and status <> 'removed' returning * into v_row;
  if not found then raise exception 'That bank account could not be found.'; end if;
  return public._bank_masked(v_row);
end $$;

create or replace function public.client_remove_bank_account(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.client_bank_accounts;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into v_row from public.client_bank_accounts where id = p_id and user_id = v_uid and status <> 'removed' for update;
  if not found then raise exception 'That bank account could not be found.'; end if;
  if exists (select 1 from public.transactions where bank_account_id = v_row.id and type = 'withdrawal'
               and status in ('pending_review', 'pending', 'requested', 'under_review', 'approved', 'processing')) then
    raise exception 'This bank account has a withdrawal in progress. Wait until it is finished before removing it.';
  end if;
  update public.client_bank_accounts set status = 'removed', removed_at = now(), updated_at = now() where id = v_row.id;
  perform public._audit('bank_account_removed', v_uid, 'client_bank_accounts', v_row.id::text,
    jsonb_build_object('country', v_row.country, 'route', v_row.route, 'last4', v_row.account_last4));
end $$;

-- Same rules as client_request_withdrawal_to_wallet (locking, held balance,
-- idempotency, rate limit), with a saved bank account as the destination.
create or replace function public.client_request_withdrawal_to_bank(
  p_amount numeric, p_source text, p_bank_account_id uuid, p_notes text default null, p_idempotency_key text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_key text := public._check_idempotency_key(p_idempotency_key);
  v_bank public.client_bank_accounts; v_acc public.accounts; s jsonb;
  v_pending numeric; v_balance numeric; v_tx public.transactions;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_source not in ('available_balance', 'profit_balance') then raise exception 'Choose which balance to withdraw from'; end if;

  select value into s from public.system_settings where key = 'bank_withdrawals';
  if not coalesce((s->>'enabled')::boolean, false) then raise exception 'Bank withdrawals are not available right now.'; end if;
  select * into v_bank from public.client_bank_accounts
   where id = p_bank_account_id and user_id = v_uid and status in ('pending_review', 'verified') for update;
  if not found then raise exception 'Choose one of your saved bank accounts.'; end if;
  if not (coalesce(s->'routes', '[]'::jsonb) ? v_bank.route) then raise exception 'Bank withdrawals to this country are not available right now.'; end if;
  if exists (select 1 from public.profiles where id = v_uid and account_status = 'suspended') then
    raise exception 'Your account is suspended. Contact support.';
  end if;

  select * into v_acc from public.accounts where user_id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  if v_key is not null then
    select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = v_key;
    if found then return v_tx; end if;
  end if;
  if (select count(*) from public.transactions where user_id = v_uid and type = 'withdrawal'
        and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many withdrawal requests. Please wait a few minutes and try again.';
  end if;

  v_balance := case when p_source = 'profit_balance' then v_acc.profit_balance else v_acc.available_balance end;
  select coalesce(sum(amount), 0) into v_pending from public.transactions
   where user_id = v_uid and type = 'withdrawal' and method = p_source
     and status in ('pending_review', 'pending', 'requested', 'under_review');
  if round(p_amount, 2) > v_balance - v_pending then
    raise exception 'Amount is more than you can withdraw. Available: %',
      to_char(greatest(v_balance - v_pending, 0), 'FM999,999,999,990.00');
  end if;

  insert into public.transactions (user_id, type, method, amount, status, reference, address, network, asset, notes, idempotency_key, bank_account_id)
  values (v_uid, 'withdrawal', p_source, round(p_amount, 2), 'pending_review',
          'WDR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          'Bank account •••• ' || v_bank.account_last4 || ' (' || v_bank.country || ', ' || v_bank.currency || ')',
          'Bank transfer', 'USD', nullif(trim(p_notes), ''), v_key, v_bank.id)
  returning * into v_tx;
  return v_tx;
end $$;

-- ---------------------------------------------------------------- admin functions
create or replace function public.admin_review_bank_account(p_id uuid, p_action text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.client_bank_accounts;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('verify', 'reject') then raise exception 'Action must be verify or reject'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A note is required for every decision'; end if;
  update public.client_bank_accounts
     set status = case when p_action = 'verify' then 'verified' else 'rejected' end,
         review_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_id and status in ('pending_review', 'verified', 'rejected')
   returning * into v_row;
  if not found then raise exception 'Bank account not found'; end if;
  perform public._audit('bank_account_' || case when p_action = 'verify' then 'verified' else 'rejected' end,
    v_row.user_id, 'client_bank_accounts', v_row.id::text,
    jsonb_build_object('note', trim(p_note), 'country', v_row.country, 'last4', v_row.account_last4, 'name_check', v_row.name_check));
  return public._bank_masked(v_row);
end $$;

-- Full details for making the payment. Every view is recorded with its reason.
create or replace function public.admin_bank_account_details(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.client_bank_accounts;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter why you need the full bank details'; end if;
  select * into v_row from public.client_bank_accounts where id = p_id;
  if not found then raise exception 'Bank account not found'; end if;
  perform public._audit('bank_account_details_viewed', v_row.user_id, 'client_bank_accounts', v_row.id::text,
    jsonb_build_object('reason', trim(p_reason), 'last4', v_row.account_last4));
  return public._bank_masked(v_row) || jsonb_build_object('details',
    extensions.pgp_sym_decrypt(v_row.details_enc, public._bank_key())::jsonb);
end $$;

-- admin_review_transaction: unchanged except for bank withdrawals, which can
-- be approved only once the bank account is verified and with the bank
-- payment reference (kept on the transaction).
create or replace function public.admin_review_transaction(p_tx_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_tx public.transactions; v_acc public.accounts; v_status text; v_bank_ref text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Action must be approve or reject'; end if;
  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_tx.status not in ('pending_review', 'pending', 'requested', 'under_review') then
    raise exception 'This transaction was already %', replace(v_tx.status, '_', ' ');
  end if;
  if v_tx.type not in ('deposit', 'withdrawal') then raise exception 'Only deposits and withdrawals can be reviewed'; end if;
  if p_action = 'approve' and v_tx.type = 'withdrawal' and v_tx.bank_account_id is not null then
    if not exists (select 1 from public.client_bank_accounts where id = v_tx.bank_account_id and status = 'verified') then
      raise exception 'Verify the client''s bank account before approving this withdrawal';
    end if;
    v_bank_ref := nullif(trim(p_reason), '');
    if v_bank_ref is null then raise exception 'Enter the bank payment reference of the transfer you sent'; end if;
  end if;
  if p_action = 'approve' then
    select * into v_acc from public.accounts where user_id = v_tx.user_id for update;
    if not found then raise exception 'Client account not found'; end if;
    if v_tx.type = 'deposit' then
      update public.accounts set account_balance = account_balance + v_tx.amount, available_balance = available_balance + v_tx.amount, updated_at = now() where id = v_acc.id;
    elsif v_tx.method = 'profit_balance' then
      if v_acc.profit_balance < v_tx.amount then raise exception 'Client profit balance is too low for this withdrawal'; end if;
      update public.accounts set profit_balance = profit_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
    else
      if v_acc.available_balance < v_tx.amount then raise exception 'Client available balance is too low for this withdrawal'; end if;
      update public.accounts set account_balance = greatest(account_balance - v_tx.amount, 0), available_balance = available_balance - v_tx.amount, updated_at = now() where id = v_acc.id;
    end if;
    v_status := 'completed';
  else
    v_status := 'rejected';
  end if;
  update public.transactions set status = v_status, updated_at = now(),
         tx_hash = coalesce(v_bank_ref, tx_hash),
         notes = concat_ws(' | ', notes, initcap(p_action) || 'd' || coalesce(': ' || nullif(trim(p_reason), ''), '')) where id = p_tx_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_tx.user_id, v_tx.type || '_' || p_action || 'd', 'transaction', p_tx_id::text,
          jsonb_build_object('transaction_id', p_tx_id, 'type', v_tx.type, 'amount', v_tx.amount, 'source', v_tx.method, 'client_id', v_tx.user_id, 'reason', nullif(trim(p_reason), ''))
          || case when v_tx.bank_account_id is not null then jsonb_build_object('bank_account_id', v_tx.bank_account_id, 'bank_payment_reference', v_bank_ref) else '{}'::jsonb end);
  return v_status;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public._bank_route_for(text) from public, anon;
revoke all on function public._bank_normalize(text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public._bank_masked(public.client_bank_accounts) from public, anon, authenticated;
revoke all on function public.client_bank_context() from public, anon;
revoke all on function public.client_save_bank_account(text, text, text, jsonb, text, uuid) from public, anon;
revoke all on function public.client_rename_bank_account(uuid, text) from public, anon;
revoke all on function public.client_remove_bank_account(uuid) from public, anon;
revoke all on function public.client_request_withdrawal_to_bank(numeric, text, uuid, text, text) from public, anon;
revoke all on function public.admin_review_bank_account(uuid, text, text) from public, anon;
revoke all on function public.admin_bank_account_details(uuid, text) from public, anon;
grant execute on function public.client_bank_context() to authenticated;
grant execute on function public.client_save_bank_account(text, text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.client_rename_bank_account(uuid, text) to authenticated;
grant execute on function public.client_remove_bank_account(uuid) to authenticated;
grant execute on function public.client_request_withdrawal_to_bank(numeric, text, uuid, text, text) to authenticated;
grant execute on function public.admin_review_bank_account(uuid, text, text) to authenticated;
grant execute on function public.admin_bank_account_details(uuid, text) to authenticated;

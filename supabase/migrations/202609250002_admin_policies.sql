-- Admin RLS policies
-- Admins can read all profiles, accounts, transactions, and audit logs.
-- Admins can update accounts and insert transactions/audit logs.

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: admin can read all
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

-- Profiles: admin can update role and name (not id)
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Accounts: admin can read all
drop policy if exists accounts_select_admin on public.accounts;
create policy accounts_select_admin on public.accounts
  for select to authenticated
  using (public.is_admin());

-- Accounts: admin can update balances
drop policy if exists accounts_update_admin on public.accounts;
create policy accounts_update_admin on public.accounts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Transactions: admin can read all
drop policy if exists transactions_select_admin on public.transactions;
create policy transactions_select_admin on public.transactions
  for select to authenticated
  using (public.is_admin());

-- Transactions: admin can insert (credit/debit adjustments)
drop policy if exists transactions_insert_admin on public.transactions;
create policy transactions_insert_admin on public.transactions
  for insert to authenticated
  with check (public.is_admin());

-- Transactions: admin can update status
drop policy if exists transactions_update_admin on public.transactions;
create policy transactions_update_admin on public.transactions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Audit logs: admin can read all
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- Audit logs: admin can insert
drop policy if exists audit_logs_insert_admin on public.audit_logs;
create policy audit_logs_insert_admin on public.audit_logs
  for insert to authenticated
  with check (public.is_admin());

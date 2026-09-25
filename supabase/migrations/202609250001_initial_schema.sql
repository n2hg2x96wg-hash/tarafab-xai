-- Tarafab.XAi Supabase foundation schema.
-- This migration is additive and does not drop or reset existing data.
-- Financial writes should be performed by trusted server-side code, not the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  account_balance numeric(20, 2) not null default 0 check (account_balance >= 0),
  available_balance numeric(20, 2) not null default 0 check (available_balance >= 0),
  invested_balance numeric(20, 2) not null default 0 check (invested_balance >= 0),
  pending_balance numeric(20, 2) not null default 0 check (pending_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('deposit', 'withdrawal', 'transfer_out', 'transfer_in', 'return', 'adjustment')),
  method text,
  amount numeric(20, 2) not null check (amount > 0),
  fee numeric(20, 2) not null default 0 check (fee >= 0),
  asset text not null default 'USD',
  address text,
  network text,
  recipient_id uuid references auth.users(id) on delete restrict,
  reference text,
  status text not null default 'pending' check (status in ('pending', 'pending_review', 'pending_verification', 'pending_blockchain_confirmation', 'completed', 'rejected', 'failed')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_user_id on public.accounts(user_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_transactions_reference on public.transactions(reference);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;

-- Customers may read only their own profile and account.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Transaction and audit writes remain server-controlled. No client insert/update/delete policies are created.
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own on public.audit_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Create a profile and an empty account whenever Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email_verified_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end
  )
  on conflict (id) do nothing;

  insert into public.accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep profile verification metadata aligned when the Auth email is confirmed.
create or replace function public.handle_user_email_confirmation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at and new.email_confirmed_at is not null then
    update public.profiles
    set email_verified_at = new.email_confirmed_at,
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row execute procedure public.handle_user_email_confirmation();

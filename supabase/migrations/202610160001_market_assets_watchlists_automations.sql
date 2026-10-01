-- Additive market asset, watchlist, and automation storage.
-- Existing financial tables and records are intentionally untouched.

create table if not exists public.market_assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  category text not null check (category in ('crypto', 'equity', 'index')),
  description text not null default '',
  icon text not null default '',
  provider text,
  provider_symbol text,
  enabled boolean not null default true,
  featured boolean not null default false,
  display_order integer not null default 0,
  automation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.market_assets
  (symbol, name, category, description, icon, provider, provider_symbol, featured, display_order)
values
  ('BTC', 'Bitcoin', 'crypto', 'The original decentralized digital asset.', '₿', 'coinbase', 'BTC-USD', true, 1),
  ('ETH', 'Ethereum', 'crypto', 'A programmable network and digital asset.', 'Ξ', 'coinbase', 'ETH-USD', true, 2),
  ('SOL', 'Solana', 'crypto', 'A high-throughput digital asset network.', 'S', 'coingecko', 'solana', false, 3),
  ('XRP', 'XRP', 'crypto', 'A digital asset built for fast settlement.', 'X', 'coingecko', 'ripple', false, 4),
  ('USDT', 'Tether', 'crypto', 'A dollar-denominated digital asset.', '₮', 'coingecko', 'tether', false, 5),
  ('TSLA', 'Tesla', 'equity', 'Tesla common stock.', 'T', null, null, false, 10),
  ('AAPL', 'Apple', 'equity', 'Apple common stock.', 'A', null, null, false, 11),
  ('NVDA', 'NVIDIA', 'equity', 'NVIDIA common stock.', 'N', null, null, false, 12),
  ('MSFT', 'Microsoft', 'equity', 'Microsoft common stock.', 'M', null, null, false, 13),
  ('AMZN', 'Amazon', 'equity', 'Amazon common stock.', 'A', null, null, false, 14),
  ('SPX', 'S&P 500', 'index', 'A broad US large-cap market index.', 'S', null, null, true, 20),
  ('NDX', 'Nasdaq 100', 'index', 'A technology-focused large-cap index.', 'N', null, null, false, 21),
  ('DJI', 'Dow Jones', 'index', 'A major US equity market index.', 'D', null, null, false, 22)
on conflict (symbol) do nothing;

alter table public.market_assets enable row level security;
drop policy if exists market_assets_read_enabled on public.market_assets;
create policy market_assets_read_enabled on public.market_assets
  for select to authenticated using (enabled or public.is_admin());
drop policy if exists market_assets_admin_write on public.market_assets;
create policy market_assets_admin_write on public.market_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.market_watchlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);
alter table public.market_watchlists enable row level security;
drop policy if exists market_watchlists_own on public.market_watchlists;
create policy market_watchlists_own on public.market_watchlists
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.market_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  condition text not null check (condition in ('price_above', 'price_below', 'change_above', 'change_below', 'volume_above')),
  threshold numeric(30, 8) not null check (threshold >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'triggered', 'error')),
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 1 and 10080),
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_automations_user_idx on public.market_automations(user_id, created_at desc);
alter table public.market_automations enable row level security;
drop policy if exists market_automations_own on public.market_automations;
create policy market_automations_own on public.market_automations
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists market_automations_admin_read on public.market_automations;
create policy market_automations_admin_read on public.market_automations
  for select to authenticated using (public.is_admin());

-- Multi-asset market, watchlists and the Automation Center. Additive only.
--
-- market_assets   : admin-managed list of assets (presentation + data mapping)
-- market_quotes   : latest real quote per asset, written only by the
--                   automation-engine Edge Function (service role)
-- client_watchlist: each client's own watchlist
-- automations     : client market-alert rules
-- automation_events: history (created/paused/triggered/...)
-- automation_engine_state: engine heartbeat + the key pg_cron uses to run it
--
-- No price is ever written by a client: quotes come from the engine, and a
-- trigger can only be recorded by the engine (service role).

create table if not exists public.market_assets (
  id text primary key check (id ~ '^[A-Z0-9.]{1,12}$'),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('crypto', 'stock', 'index', 'etf')),
  provider text not null check (provider in ('coinbase', 'coingecko', 'finnhub')),
  provider_symbol text not null check (char_length(provider_symbol) between 1 and 40),
  note text not null default '' check (char_length(note) <= 120),
  enabled boolean not null default true,
  visible boolean not null default true,
  chart_enabled boolean not null default true,
  automation_enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_assets_order_idx on public.market_assets (category, sort_order, id);

insert into public.market_assets (id, name, category, provider, provider_symbol, note, sort_order) values
  ('BTC', 'Bitcoin', 'crypto', 'coinbase', 'BTC-USD', '', 10),
  ('ETH', 'Ethereum', 'crypto', 'coinbase', 'ETH-USD', '', 20),
  ('SOL', 'Solana', 'crypto', 'coinbase', 'SOL-USD', '', 30),
  ('XRP', 'XRP', 'crypto', 'coinbase', 'XRP-USD', '', 40),
  ('ADA', 'Cardano', 'crypto', 'coinbase', 'ADA-USD', '', 50),
  ('DOGE', 'Dogecoin', 'crypto', 'coinbase', 'DOGE-USD', '', 60),
  ('LINK', 'Chainlink', 'crypto', 'coinbase', 'LINK-USD', '', 70),
  ('POL', 'Polygon', 'crypto', 'coinbase', 'POL-USD', '', 80),
  ('USDT', 'Tether', 'crypto', 'coinbase', 'USDT-USD', '', 90),
  ('USDC', 'USD Coin', 'crypto', 'coingecko', 'usd-coin', '', 100),
  ('AAPL', 'Apple', 'stock', 'finnhub', 'AAPL', '', 10),
  ('NVDA', 'NVIDIA', 'stock', 'finnhub', 'NVDA', '', 20),
  ('MSFT', 'Microsoft', 'stock', 'finnhub', 'MSFT', '', 30),
  ('AMZN', 'Amazon', 'stock', 'finnhub', 'AMZN', '', 40),
  ('GOOGL', 'Alphabet', 'stock', 'finnhub', 'GOOGL', '', 50),
  ('META', 'Meta Platforms', 'stock', 'finnhub', 'META', '', 60),
  ('TSLA', 'Tesla', 'stock', 'finnhub', 'TSLA', '', 70),
  ('NFLX', 'Netflix', 'stock', 'finnhub', 'NFLX', '', 80),
  ('AMD', 'AMD', 'stock', 'finnhub', 'AMD', '', 90),
  ('KO', 'Coca-Cola', 'stock', 'finnhub', 'KO', '', 100),
  ('SPX', 'S&P 500', 'index', 'finnhub', 'SPY', 'Tracked via the SPY ETF', 10),
  ('NDX', 'Nasdaq 100', 'index', 'finnhub', 'QQQ', 'Tracked via the QQQ ETF', 20),
  ('DJI', 'Dow Jones', 'index', 'finnhub', 'DIA', 'Tracked via the DIA ETF', 30),
  ('RUT', 'Russell 2000', 'index', 'finnhub', 'IWM', 'Tracked via the IWM ETF', 40)
on conflict (id) do nothing;

create table if not exists public.market_quotes (
  asset_id text primary key references public.market_assets(id),
  price numeric, change_pct numeric, change_abs numeric, high numeric, low numeric,
  prev_close numeric, volume numeric,
  source_time timestamptz, fetched_at timestamptz not null default now(),
  state text not null check (state in ('live', 'delayed', 'stale', 'unavailable', 'error')),
  error text check (char_length(error) <= 300)
);

create table if not exists public.client_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text not null references public.market_assets(id),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text not null references public.market_assets(id),
  kind text not null check (kind in ('price_above', 'price_below', 'pct_up', 'pct_down', 'move_abs')),
  target numeric not null check (target > 0 and target < 1e12),
  notify text not null default 'in_app' check (notify in ('in_app')),
  name text not null default '' check (char_length(name) <= 80),
  status text not null default 'active' check (status in ('active', 'paused', 'triggered', 'failed', 'deleted')),
  last_evaluated_at timestamptz, last_price numeric, last_change_pct numeric, last_data_state text,
  triggered_at timestamptz, trigger_price numeric, trigger_change_pct numeric,
  last_error text check (char_length(last_error) <= 300),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists automations_idem on public.automations (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists automations_user_idx on public.automations (user_id, created_at desc);
create index if not exists automations_active_idx on public.automations (asset_id) where status = 'active';

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('created', 'updated', 'paused', 'resumed', 'triggered', 'failed', 'deleted', 'duplicated')),
  price numeric, change_pct numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_events_idx on public.automation_events (automation_id, created_at desc);

create table if not exists public.automation_engine_state (
  id integer primary key default 1 check (id = 1),
  run_key text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  last_run_at timestamptz, last_ok_at timestamptz, last_error text, last_evaluated integer, last_triggered integer,
  updated_at timestamptz not null default now()
);
insert into public.automation_engine_state (id) values (1) on conflict (id) do nothing;

-- RLS
alter table public.market_assets enable row level security;
alter table public.market_quotes enable row level security;
alter table public.client_watchlist enable row level security;
alter table public.automations enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_engine_state enable row level security;

drop policy if exists market_assets_read on public.market_assets;
create policy market_assets_read on public.market_assets for select using ((enabled and visible) or public.is_admin());
drop policy if exists market_quotes_read on public.market_quotes;
create policy market_quotes_read on public.market_quotes for select using (true);
drop policy if exists watchlist_own on public.client_watchlist;
create policy watchlist_own on public.client_watchlist for select using (user_id = (select auth.uid()));
drop policy if exists automations_own on public.automations;
create policy automations_own on public.automations for select using ((user_id = (select auth.uid()) and status <> 'deleted') or public.is_admin());
drop policy if exists automation_events_own on public.automation_events;
create policy automation_events_own on public.automation_events for select using (user_id = (select auth.uid()) or public.is_admin());
-- automation_engine_state: no policy (service role only).

revoke all on public.market_assets, public.market_quotes, public.client_watchlist, public.automations,
  public.automation_events, public.automation_engine_state from anon, authenticated;
grant select on public.market_assets, public.market_quotes to anon, authenticated;
grant select on public.client_watchlist, public.automations, public.automation_events to authenticated;

-- Notifications gain a 'market' type for triggered alerts (constraint widened only).
alter table public.client_notifications drop constraint if exists client_notifications_type_check;
alter table public.client_notifications add constraint client_notifications_type_check
  check (type = any (array['account', 'deposit', 'withdrawal', 'security', 'announcement', 'investment', 'market']));

-- ---------- Watchlist (client) ----------
create or replace function public.client_watchlist_set(p_asset text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_on then
    if not exists (select 1 from public.market_assets where id = p_asset and enabled and visible) then raise exception 'This asset is not available.'; end if;
    select count(*) into v_n from public.client_watchlist where user_id = v_uid;
    if v_n >= 50 then raise exception 'Your watchlist is full (50 assets).'; end if;
    insert into public.client_watchlist (user_id, asset_id, position) values (v_uid, p_asset, v_n) on conflict do nothing;
  else
    delete from public.client_watchlist where user_id = v_uid and asset_id = p_asset;
  end if;
  return jsonb_build_object('asset', p_asset, 'on', p_on);
end $$;

create or replace function public.client_watchlist_reorder(p_assets text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); i int;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  for i in 1 .. coalesce(array_length(p_assets, 1), 0) loop
    update public.client_watchlist set position = i where user_id = v_uid and asset_id = p_assets[i];
  end loop;
end $$;

-- ---------- Automations (client) ----------
create or replace function public._automation_event(p_id uuid, p_user uuid, p_event text, p_details jsonb, p_price numeric default null, p_pct numeric default null)
returns void language sql security definer set search_path = public as $$
  insert into public.automation_events (automation_id, user_id, event, price, change_pct, details)
  values (p_id, p_user, p_event, p_price, p_pct, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public._automation_validate(p_asset text, p_kind text, p_target numeric)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.market_assets where id = p_asset and enabled and visible and automation_enabled) then
    raise exception 'Automations are not available for this asset.';
  end if;
  if p_kind not in ('price_above', 'price_below', 'pct_up', 'pct_down', 'move_abs') then raise exception 'Choose a supported condition.'; end if;
  if p_target is null or p_target <= 0 then raise exception 'Enter a target greater than zero.'; end if;
  if p_kind in ('pct_up', 'pct_down', 'move_abs') and p_target > 1000 then raise exception 'Enter a percentage up to 1000.'; end if;
end $$;

create or replace function public.client_automation_create(p_asset text, p_kind text, p_target numeric, p_name text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a public.automations%rowtype;
begin
  if v_uid is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select * into a from public.automations where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then return to_jsonb(a); end if;
  end if;
  perform public._automation_validate(p_asset, p_kind, p_target);
  if (select count(*) from public.automations where user_id = v_uid and status in ('active', 'paused')) >= 50 then
    raise exception 'You can keep up to 50 active or paused automations.';
  end if;
  insert into public.automations (user_id, asset_id, kind, target, name, idempotency_key)
  values (v_uid, p_asset, p_kind, round(p_target, 8), left(trim(coalesce(p_name, '')), 80), p_idempotency_key)
  returning * into a;
  perform public._automation_event(a.id, v_uid, 'created', jsonb_build_object('asset', p_asset, 'kind', p_kind, 'target', a.target));
  return to_jsonb(a);
end $$;

create or replace function public.client_automation_update(p_id uuid, p_kind text, p_target numeric, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a public.automations%rowtype;
begin
  select * into a from public.automations where id = p_id and user_id = v_uid and status <> 'deleted' for update;
  if not found then raise exception 'Automation not found.'; end if;
  perform public._automation_validate(a.asset_id, p_kind, p_target);
  -- Editing re-arms a triggered or failed rule.
  update public.automations set kind = p_kind, target = round(p_target, 8), name = left(trim(coalesce(p_name, '')), 80),
         status = case when a.status in ('triggered', 'failed') then 'active' else a.status end,
         triggered_at = case when a.status in ('triggered', 'failed') then null else triggered_at end,
         last_error = null, updated_at = now()
   where id = p_id returning * into a;
  perform public._automation_event(a.id, v_uid, 'updated', jsonb_build_object('kind', p_kind, 'target', a.target));
  return to_jsonb(a);
end $$;

create or replace function public.client_automation_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a public.automations%rowtype;
begin
  if p_status not in ('active', 'paused', 'deleted') then raise exception 'Unsupported status.'; end if;
  select * into a from public.automations where id = p_id and user_id = v_uid and status <> 'deleted' for update;
  if not found then raise exception 'Automation not found.'; end if;
  if p_status = 'active' then perform public._automation_validate(a.asset_id, a.kind, a.target); end if;
  update public.automations set status = p_status, updated_at = now(),
         triggered_at = case when p_status = 'active' then null else triggered_at end, last_error = case when p_status = 'active' then null else last_error end
   where id = p_id returning * into a;
  perform public._automation_event(a.id, v_uid, case p_status when 'active' then 'resumed' when 'paused' then 'paused' else 'deleted' end, '{}'::jsonb);
  return to_jsonb(a);
end $$;

create or replace function public.client_automation_duplicate(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.automations%rowtype; r jsonb;
begin
  select * into s from public.automations where id = p_id and user_id = v_uid and status <> 'deleted';
  if not found then raise exception 'Automation not found.'; end if;
  r := public.client_automation_create(s.asset_id, s.kind, s.target, left(s.name || ' (copy)', 80), null);
  perform public._automation_event((r->>'id')::uuid, v_uid, 'duplicated', jsonb_build_object('from', p_id));
  return r;
end $$;

-- ---------- Engine (service role only) ----------
create or replace function public.engine_record_quote(p_asset text, p_price numeric, p_change_pct numeric, p_change_abs numeric, p_high numeric, p_low numeric,
  p_prev_close numeric, p_volume numeric, p_source_time timestamptz, p_state text, p_error text)
returns void language sql security definer set search_path = public as $$
  insert into public.market_quotes as q (asset_id, price, change_pct, change_abs, high, low, prev_close, volume, source_time, fetched_at, state, error)
  values (p_asset, p_price, p_change_pct, p_change_abs, p_high, p_low, p_prev_close, p_volume, p_source_time, now(), p_state, left(p_error, 300))
  on conflict (asset_id) do update set
    price = coalesce(excluded.price, q.price), change_pct = coalesce(excluded.change_pct, q.change_pct), change_abs = coalesce(excluded.change_abs, q.change_abs),
    high = coalesce(excluded.high, q.high), low = coalesce(excluded.low, q.low), prev_close = coalesce(excluded.prev_close, q.prev_close),
    volume = coalesce(excluded.volume, q.volume), source_time = coalesce(excluded.source_time, q.source_time),
    fetched_at = now(), state = excluded.state, error = excluded.error
$$;

-- Records a trigger exactly once: only an 'active' rule can move to
-- 'triggered', under a row lock, so a repeated or overlapping run cannot
-- notify twice.
create or replace function public.engine_trigger(p_id uuid, p_price numeric, p_change_pct numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.automations%rowtype; v_asset public.market_assets%rowtype; v_title text; v_body text; v_cond text;
begin
  select * into a from public.automations where id = p_id for update;
  if not found or a.status <> 'active' then return false; end if;
  select * into v_asset from public.market_assets where id = a.asset_id;
  update public.automations set status = 'triggered', triggered_at = now(), trigger_price = p_price, trigger_change_pct = p_change_pct,
         last_price = p_price, last_change_pct = p_change_pct, last_evaluated_at = now(), updated_at = now() where id = p_id;
  perform public._automation_event(p_id, a.user_id, 'triggered', jsonb_build_object('kind', a.kind, 'target', a.target), p_price, p_change_pct);
  v_cond := case a.kind
    when 'price_above' then 'rose to or above $' || a.target
    when 'price_below' then 'fell to or below $' || a.target
    when 'pct_up' then 'is up ' || a.target || '% or more in 24 hours'
    when 'pct_down' then 'is down ' || a.target || '% or more in 24 hours'
    else 'moved ' || a.target || '% or more in 24 hours' end;
  v_title := left(coalesce(nullif(a.name, ''), v_asset.name || ' alert'), 120);
  v_body := v_asset.name || ' (' || v_asset.id || ') ' || v_cond || '. Price: $' || round(p_price, 6)::text
            || coalesce(', 24h change: ' || round(p_change_pct, 2)::text || '%', '') || '. This alert is now complete; edit or resume it to watch again.';
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target)
  values (a.user_id, 'market', v_title, left(v_body, 1000), 'Open automations', '#automations');
  return true;
end $$;

create or replace function public.engine_mark_evaluated(p_ids uuid[], p_asset text, p_price numeric, p_change_pct numeric, p_state text, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.automations set last_evaluated_at = now(), last_price = coalesce(p_price, last_price), last_change_pct = coalesce(p_change_pct, last_change_pct),
         last_data_state = p_state, last_error = left(p_error, 300)
   where id = any(p_ids) and status = 'active'
$$;

-- Admin
create or replace function public.admin_automation_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.automations group by status) s),
    'engine', (select to_jsonb(e) - 'run_key' from public.automation_engine_state e where id = 1),
    'triggered_24h', (select count(*) from public.automation_events where event = 'triggered' and created_at > now() - interval '24 hours'),
    'failed_24h', (select count(*) from public.automation_events where event = 'failed' and created_at > now() - interval '24 hours'));
end $$;

create or replace function public.admin_list_automations(p_status text default null, p_asset text default null, p_before timestamptz default null, p_limit int default 50)
returns table (id uuid, user_id uuid, full_name text, asset_id text, kind text, target numeric, status text, name text,
  last_evaluated_at timestamptz, last_price numeric, last_data_state text, triggered_at timestamptz, trigger_price numeric, last_error text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query select a.id, a.user_id, p.full_name, a.asset_id, a.kind, a.target, a.status, a.name, a.last_evaluated_at, a.last_price,
    a.last_data_state, a.triggered_at, a.trigger_price, a.last_error, a.created_at
    from public.automations a left join public.profiles p on p.id = a.user_id
   where (p_status is null or a.status = p_status) and (p_asset is null or a.asset_id = p_asset) and (p_before is null or a.created_at < p_before)
   order by a.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_update_asset(p_id text, p_name text, p_category text, p_enabled boolean, p_visible boolean,
  p_chart boolean, p_automation boolean, p_sort integer, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.market_assets%rowtype; a public.market_assets%rowtype;
begin
  perform public._require_admin();
  select * into b from public.market_assets where id = p_id for update;
  if not found then raise exception 'Asset not found.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Enter a name.'; end if;
  if p_category not in ('crypto', 'stock', 'index', 'etf') then raise exception 'Choose a category.'; end if;
  update public.market_assets set name = left(trim(p_name), 80), category = p_category, enabled = p_enabled, visible = p_visible,
         chart_enabled = p_chart, automation_enabled = p_automation, sort_order = coalesce(p_sort, sort_order),
         note = left(trim(coalesce(p_note, '')), 120), updated_at = now()
   where id = p_id returning * into a;
  perform public._audit('ADMIN_ASSET_UPDATED', null, 'market_asset', p_id, jsonb_build_object('before', to_jsonb(b), 'after', to_jsonb(a)));
  return to_jsonb(a);
end $$;

-- Grants
revoke all on function public.client_watchlist_set(text, boolean), public.client_watchlist_reorder(text[]),
  public.client_automation_create(text, text, numeric, text, text), public.client_automation_update(uuid, text, numeric, text),
  public.client_automation_set_status(uuid, text), public.client_automation_duplicate(uuid),
  public.admin_automation_overview(), public.admin_list_automations(text, text, timestamptz, int),
  public.admin_update_asset(text, text, text, boolean, boolean, boolean, boolean, integer, text) from public, anon;
grant execute on function public.client_watchlist_set(text, boolean), public.client_watchlist_reorder(text[]),
  public.client_automation_create(text, text, numeric, text, text), public.client_automation_update(uuid, text, numeric, text),
  public.client_automation_set_status(uuid, text), public.client_automation_duplicate(uuid),
  public.admin_automation_overview(), public.admin_list_automations(text, text, timestamptz, int),
  public.admin_update_asset(text, text, text, boolean, boolean, boolean, boolean, integer, text) to authenticated;
revoke all on function public._automation_event(uuid, uuid, text, jsonb, numeric, numeric), public._automation_validate(text, text, numeric),
  public.engine_record_quote(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, text, text),
  public.engine_trigger(uuid, numeric, numeric), public.engine_mark_evaluated(uuid[], text, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.engine_record_quote(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, text, text),
  public.engine_trigger(uuid, numeric, numeric), public.engine_mark_evaluated(uuid[], text, numeric, numeric, text, text) to service_role;

-- Client menu: admin-hideable 'automations' section; the existing 'markets'
-- section becomes the Asset Center.
create or replace function public._client_nav_optional()
returns text[] language sql immutable set search_path = public as $$
  select array['portfolio', 'markets', 'marketActivity', 'priceHistory', 'transactions', 'performance',
               'deposit', 'withdraw', 'depositHistory', 'withdrawalHistory', 'notifications', 'support', 'wallet', 'automations']
$$;

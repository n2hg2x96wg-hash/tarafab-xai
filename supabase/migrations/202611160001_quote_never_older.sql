-- Market quotes: an older provider reading never replaces a newer one
-- (additive, non-destructive; same signature, grants kept).
--
-- engine_record_quote() upserts the latest reading per asset. Until now any
-- reading replaced the stored one, so a provider answer carrying an older
-- source_time (a lagging CoinGecko edge, a slow request) could overwrite a
-- newer quote and make the price go backwards in time. The update is now
-- skipped when the incoming source_time is older than the stored one.
--
-- Unchanged: a failed fetch (no price, no source_time) still records its
-- state and keeps the last valid price and its original source_time
-- (coalesce), so pages show that last price as stale with its real time,
-- never as current. No rows are rewritten by this migration.

create or replace function public.engine_record_quote(p_asset text, p_price numeric, p_change_pct numeric, p_change_abs numeric, p_high numeric, p_low numeric, p_prev_close numeric, p_volume numeric, p_source_time timestamp with time zone, p_state text, p_error text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.market_quotes as q (asset_id, price, change_pct, change_abs, high, low, prev_close, volume, source_time, fetched_at, state, error)
  values (p_asset, p_price, p_change_pct, p_change_abs, p_high, p_low, p_prev_close, p_volume, p_source_time, now(), p_state, left(p_error, 300))
  on conflict (asset_id) do update set
    price = coalesce(excluded.price, q.price), change_pct = coalesce(excluded.change_pct, q.change_pct), change_abs = coalesce(excluded.change_abs, q.change_abs),
    high = coalesce(excluded.high, q.high), low = coalesce(excluded.low, q.low), prev_close = coalesce(excluded.prev_close, q.prev_close),
    volume = coalesce(excluded.volume, q.volume), source_time = coalesce(excluded.source_time, q.source_time),
    fetched_at = now(), state = excluded.state, error = excluded.error
  where excluded.source_time is null or q.source_time is null or excluded.source_time >= q.source_time
$function$;

-- The index assets (S&P 500, Nasdaq 100, Dow Jones) were seeded with no
-- provider/provider_symbol, so they always showed "unavailable": quoteAsset()
-- short-circuits before any request when either is missing. Coinbase and
-- CoinGecko (the two providers already used elsewhere in this file) do not
-- serve index data, so this adds Stooq, a free, no-key, legitimate quote
-- source, and only touches assets that have no provider configured yet so an
-- admin override is never clobbered.
update public.market_assets set provider = 'stooq', provider_symbol = '^spx', updated_at = now()
  where symbol = 'SPX' and provider is null;
update public.market_assets set provider = 'stooq', provider_symbol = '^ndx', updated_at = now()
  where symbol = 'NDX' and provider is null;
update public.market_assets set provider = 'stooq', provider_symbol = '^dji', updated_at = now()
  where symbol = 'DJI' and provider is null;

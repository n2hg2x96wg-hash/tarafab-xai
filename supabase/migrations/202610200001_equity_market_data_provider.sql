-- Add end-of-day quotes for the configured US equities. Preserve any provider
-- mapping already configured by an administrator.
update public.market_assets
   set provider = 'stooq',
       provider_symbol = case symbol
         when 'TSLA' then 'tsla.us'
         when 'AAPL' then 'aapl.us'
         when 'NVDA' then 'nvda.us'
         when 'MSFT' then 'msft.us'
         when 'AMZN' then 'amzn.us'
       end,
       updated_at = now()
 where symbol in ('TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN')
   and provider is null
   and provider_symbol is null;

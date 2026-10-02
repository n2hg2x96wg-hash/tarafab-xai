-- Checks submitted external-wallet transfers on-chain every minute (only
-- calls out while a transfer is pending). Uses the same private run key as
-- the automation engine; it is never sent to browsers.
select cron.schedule('tarafab-transfer-verify', '* * * * *', $c$
  select net.http_post(
    url := 'https://jdskpqjwmaeurxspipyv.supabase.co/functions/v1/transfer-verify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-engine-key', (select run_key from public.automation_engine_state where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
  where exists (select 1 from public.wallet_transfers where status in ('submitted', 'confirming'))
$c$);

-- Runs the automation-engine Edge Function every minute (server-side, no
-- browser needed). The request carries the engine run key, read from
-- automation_engine_state at call time; it is never exposed to clients.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'tarafab-automation-engine';
select cron.schedule('tarafab-automation-engine', '* * * * *', $job$
  select net.http_post(
    url := 'https://jdskpqjwmaeurxspipyv.supabase.co/functions/v1/automation-engine',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-engine-key', (select run_key from public.automation_engine_state where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$job$);

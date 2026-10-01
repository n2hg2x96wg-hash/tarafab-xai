-- Fixes automation/watchlist creation: the client API inserts rows without
-- an explicit user_id (it relies on the signed-in request, same as every
-- other RLS-protected table in this schema). Both columns are `not null`
-- with no default, so every insert was rejected (either by the NOT NULL
-- constraint or by the `with check (user_id = auth.uid())` RLS policy, since
-- a NULL never equals auth.uid()) before the row was ever persisted. Giving
-- each column a default of the caller's own auth.uid() makes a plain
-- authenticated insert work exactly like the existing RLS policies already
-- assume, without weakening them or allowing a user to set another user's id
-- (the `with check` clauses are unchanged and still enforce
-- user_id = auth.uid(); a client that tried to pass a different user_id
-- would still be rejected).
alter table public.market_watchlists alter column user_id set default auth.uid();
alter table public.market_automations alter column user_id set default auth.uid();

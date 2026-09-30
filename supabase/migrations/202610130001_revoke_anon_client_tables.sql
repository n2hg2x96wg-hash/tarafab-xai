-- Defense in depth: signed-out (anon) requests never need these client tables.
-- RLS already returns no rows to anon; this removes the table privilege too.
-- Privileges only: no rows, policies or functions change. The public product
-- catalogue (investment_products / investment_product_versions) stays readable.
revoke select on public.kyc_submissions from anon;
revoke select on public.client_investments from anon;
revoke select on public.client_investment_events from anon;
revoke select on public.investment_transactions from anon;
revoke select on public.client_notifications from anon;
revoke select on public.client_notification_reads from anon;

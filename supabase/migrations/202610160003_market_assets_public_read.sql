-- Signed-out visitors read the public asset list. The original policy called
-- is_admin(), which signed-out requests may not execute, so the read failed.
-- Public readers get a plain rule; admins get their own policy.
drop policy if exists market_assets_read on public.market_assets;
drop policy if exists market_assets_public on public.market_assets;
drop policy if exists market_assets_admin on public.market_assets;
create policy market_assets_public on public.market_assets for select to anon, authenticated using (enabled and visible);
create policy market_assets_admin on public.market_assets for select to authenticated using (public.is_admin());

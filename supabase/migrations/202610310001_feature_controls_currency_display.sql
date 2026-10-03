-- Client Dashboard Feature Controls + global currency display. Additive only.
-- 1) One feature flag per client module. All start 'enabled', so clients see
--    no change until an admin switches something off. Off = 'disabled'
--    (readable by clients, hidden in the UI, refused by the API routes).
insert into public.feature_flags (key, state, label, note) values
  ('markets', 'enabled', 'Markets', ''),
  ('charts', 'enabled', 'Charts', ''),
  ('watchlist', 'enabled', 'Watchlist', ''),
  ('portfolio', 'enabled', 'Portfolio', ''),
  ('investments', 'enabled', 'Investment Center', ''),
  ('wallet', 'enabled', 'Wallet', ''),
  ('deposits', 'enabled', 'Deposits', ''),
  ('withdrawals', 'enabled', 'Withdrawals', ''),
  ('activity', 'enabled', 'Activity (transactions)', ''),
  ('verification', 'enabled', 'Verification (KYC)', ''),
  ('announcements', 'enabled', 'Announcements / notifications', ''),
  ('support', 'enabled', 'Support / contact', ''),
  ('trading_status', 'enabled', 'Trading / automation status indicators', '')
on conflict (key) do nothing;

-- 2) Currency display settings (display only; checkout stays NGN, Nigeria).
alter table public.premium_settings add column if not exists currency_config jsonb not null default
  '{"auto_detect": true, "fallback": "USD", "enabled": ["NGN","USD","GBP","EUR","CAD","AUD","PHP","GHS","KES","ZAR","INR","AED"]}'::jsonb;

create or replace function public.admin_set_currency_config(p_config jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old jsonb; v_enabled jsonb; v_fallback text;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  v_enabled := coalesce(p_config->'enabled', '[]'::jsonb);
  v_fallback := upper(coalesce(p_config->>'fallback', 'USD'));
  if jsonb_typeof(v_enabled) <> 'array' or exists (select 1 from jsonb_array_elements_text(v_enabled) c where c !~ '^[A-Z]{3}$') then
    raise exception 'Currencies must be three-letter codes.';
  end if;
  if not v_enabled ? 'NGN' then v_enabled := v_enabled || '["NGN"]'::jsonb; end if;  -- NGN is the billing currency
  if v_fallback !~ '^[A-Z]{3}$' or not v_enabled ? v_fallback then raise exception 'The fallback currency must be one of the enabled currencies.'; end if;
  select currency_config into old from public.premium_settings where id = 1 for update;
  update public.premium_settings set currency_config = jsonb_build_object('auto_detect', coalesce((p_config->>'auto_detect')::boolean, true),
         'fallback', v_fallback, 'enabled', v_enabled), updated_by = auth.uid(), updated_at = now() where id = 1;
  perform public._audit('currency_config_changed', null, 'premium_settings', '1', jsonb_build_object('before', old, 'after', p_config, 'reason', trim(p_reason)));
  return (select currency_config from public.premium_settings where id = 1);
end $$;
revoke all on function public.admin_set_currency_config(jsonb, text) from public, anon;
grant execute on function public.admin_set_currency_config(jsonb, text) to authenticated;

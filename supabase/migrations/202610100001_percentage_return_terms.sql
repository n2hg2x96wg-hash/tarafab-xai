-- Percentage-of-principal return mode = the existing 'fixed_rate' type (no duplicate
-- engine). Additive only. Each investment also snapshots the exact rate / flat
-- amount it was made under, so later product versions never change it.
--
-- Accounting rule (unchanged, from admin_review_investment): principal =
-- amount - entry fee. The projected return is computed on that principal, in
-- exact numeric arithmetic. Projections are never credited automatically;
-- credited profit is recorded per investment by admin_set_investment_profit.

alter table public.client_investments
  add column if not exists return_rate_pct numeric(8,4),
  add column if not exists return_amount numeric(14,2);

alter table public.investment_product_versions drop constraint if exists investment_product_versions_return_rate_pct_check;
alter table public.investment_product_versions
  add constraint investment_product_versions_return_rate_pct_check check (return_rate_pct is null or (return_rate_pct >= 0 and return_rate_pct <= 9999));

create or replace function public.admin_save_product_draft_v3(
  p_product_id uuid, p_code text, p_name text, p_description text, p_min_amount numeric, p_max_amount numeric,
  p_duration_value int, p_duration_unit text, p_risk_level text, p_risk_disclosure text, p_terms_text text,
  p_entry_fee_pct numeric, p_return_type text, p_return_rate_pct numeric, p_return_amount numeric,
  p_kyc_required boolean, p_cancellation_allowed boolean, p_cancellation_terms text
) returns public.investment_product_versions
language plpgsql security definer set search_path = public as $$
declare
  v_ver public.investment_product_versions; v_prev public.investment_product_versions;
  v_type text := coalesce(p_return_type, 'none'); v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb;
  v_top numeric;
begin
  perform public._require_admin();
  if v_type not in ('none', 'fixed_rate', 'fixed_amount') then raise exception 'Unknown return type'; end if;
  if v_type = 'fixed_rate' then
    if p_return_rate_pct is null or p_return_rate_pct < 0 or p_return_rate_pct > 9999 or p_return_rate_pct <> round(p_return_rate_pct, 4) then
      raise exception 'Enter a return percentage between 0 and 9999 (up to 4 decimals)';
    end if;
    -- The largest possible total value must fit the money columns.
    v_top := coalesce(p_max_amount, p_min_amount);
    if v_top is null or v_top * (1 + p_return_rate_pct / 100) >= 100000000000 then
      raise exception 'The configured return is too large for the maximum investment';
    end if;
  end if;
  if v_type = 'fixed_amount' and (p_return_amount is null or p_return_amount < 0 or p_return_amount <> round(p_return_amount, 2)) then
    raise exception 'Enter the configured return amount (2 decimals at most)';
  end if;

  if p_product_id is not null then
    select * into v_prev from public.investment_product_versions where product_id = p_product_id order by version desc limit 1;
  end if;

  v_ver := public.admin_save_product_draft_v2(p_product_id, p_code, p_name, p_description, p_min_amount, p_max_amount,
    p_duration_value, p_duration_unit, p_risk_level, p_risk_disclosure, p_terms_text, p_entry_fee_pct,
    v_type, case when v_type = 'fixed_rate' then p_return_rate_pct else null end,
    p_kyc_required, p_cancellation_allowed, p_cancellation_terms);
  if v_type = 'fixed_amount' then
    update public.investment_product_versions set return_amount = round(p_return_amount, 2) where id = v_ver.id returning * into v_ver;
  end if;

  -- Audit exactly which financial terms changed, with previous and new values.
  v_new := jsonb_build_object('return_type', v_ver.return_type, 'return_rate_pct', v_ver.return_rate_pct, 'return_amount', v_ver.return_amount,
    'min_amount', v_ver.min_amount, 'max_amount', v_ver.max_amount, 'duration_value', v_ver.duration_value,
    'duration_unit', v_ver.duration_unit, 'entry_fee_pct', v_ver.entry_fee_pct);
  if v_prev.id is not null then
    v_old := jsonb_build_object('return_type', v_prev.return_type, 'return_rate_pct', v_prev.return_rate_pct, 'return_amount', v_prev.return_amount,
      'min_amount', v_prev.min_amount, 'max_amount', v_prev.max_amount, 'duration_value', v_prev.duration_value,
      'duration_unit', v_prev.duration_unit, 'entry_fee_pct', v_prev.entry_fee_pct);
  end if;
  if v_old is distinct from v_new then
    insert into public.audit_logs (user_id, actor_id, action, entity, entity_id, details)
    values (auth.uid(), auth.uid(), 'investment_product_terms_changed', 'investment_product', v_ver.product_id::text,
            jsonb_build_object('version', v_ver.version, 'version_id', v_ver.id,
                               'previous', case when v_prev.id is null then null else v_old end, 'new', v_new));
  end if;
  return v_ver;
end $$;

-- client_submit_investment: same as 202610090001 plus it stores the exact
-- return_rate_pct / return_amount of the version on the investment. The
-- statements that differ are the insert column list and values:
--   ... reference, return_type, return_rate_pct, return_amount, expected_return, expected_total
--   ... v_ref, v_ver.return_type, v_ver.return_rate_pct, v_ver.return_amount, v_exp, v_net + v_exp
-- and the audit details also carry 'return_rate_pct'.
-- The full applied body is stored in the database (see pg_get_functiondef).

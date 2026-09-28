-- Additive: widen the allowed statuses to include 'under_review', and give the
-- admin panel one queue that also surfaces clients whose verification state was
-- set before the KYC submission table existed. Nothing is dropped and no row is
-- changed: the constraints below only permit an extra value.

alter table public.kyc_submissions drop constraint if exists kyc_submissions_status_check;
alter table public.kyc_submissions add constraint kyc_submissions_status_check
  check (status in ('pending', 'under_review', 'verified', 'rejected'));

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('unverified', 'pending', 'under_review', 'verified', 'rejected'));

-- "One open submission per client" now covers both open states.
drop index if exists public.kyc_submissions_one_pending;
create unique index if not exists kyc_submissions_one_open
  on public.kyc_submissions (user_id) where status in ('pending', 'under_review');

-- Admin review, extended with 'review' to move a request to under_review.
create or replace function public.admin_review_kyc(p_submission_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_row public.kyc_submissions; v_status text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('review', 'verify', 'reject') then raise exception 'Action must be review, verify or reject'; end if;

  select * into v_row from public.kyc_submissions where id = p_submission_id for update;
  if not found then raise exception 'Verification request not found'; end if;
  if v_row.status not in ('pending', 'under_review') then raise exception 'This request was already %', v_row.status; end if;
  if p_action = 'review' and v_row.status = 'under_review' then raise exception 'This request is already under review'; end if;
  if p_action = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting a verification request';
  end if;

  v_status := case p_action when 'verify' then 'verified' when 'reject' then 'rejected' else 'under_review' end;

  update public.kyc_submissions
    set status = v_status,
        -- Moving to under_review is not a decision, so the reviewer and time
        -- are only recorded once the request is actually decided.
        reviewed_at = case when p_action = 'review' then reviewed_at else now() end,
        reviewed_by = case when p_action = 'review' then reviewed_by else v_admin end,
        rejection_reason = case when p_action = 'reject' then trim(p_reason) else null end,
        updated_at = now()
  where id = p_submission_id;

  update public.profiles set verification_status = v_status, updated_at = now() where id = v_row.user_id;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_row.user_id, 'kyc_' || v_status, 'kyc_submission', p_submission_id::text,
          jsonb_build_object('submission_id', p_submission_id, 'client_id', v_row.user_id,
                             'reason', nullif(trim(p_reason), '')));

  return v_status;
end $$;

-- The admin queue: every submission, plus any client who carries a
-- verification state from before this table existed so those records stay
-- visible instead of disappearing from the panel.
create or replace function public.admin_kyc_queue()
returns table (
  id uuid, user_id uuid, status text, full_legal_name text, date_of_birth date,
  country text, address text, document_type text, document_number text,
  document_path text, selfie_path text, submitted_at timestamptz,
  reviewed_at timestamptz, rejection_reason text, client_name text,
  client_email text, legacy boolean
) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select k.id, k.user_id, k.status, k.full_legal_name, k.date_of_birth, k.country, k.address,
           k.document_type, k.document_number, k.document_path, k.selfie_path, k.submitted_at,
           k.reviewed_at, k.rejection_reason, p.full_name, u.email::text, false
      from public.kyc_submissions k
      join public.profiles p on p.id = k.user_id
      left join auth.users u on u.id = k.user_id
    union all
    select null::uuid, p.id, p.verification_status, p.full_name, null::date, null, null,
           null, null, null, null, p.created_at, null::timestamptz, null, p.full_name, u.email::text, true
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.role = 'customer'
       and p.verification_status <> 'unverified'
       and not exists (select 1 from public.kyc_submissions k2 where k2.user_id = p.id)
    order by submitted_at desc;
end $$;

revoke all on function public.admin_kyc_queue() from public, anon;
grant execute on function public.admin_kyc_queue() to authenticated;

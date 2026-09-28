-- KYC / account verification.
--
-- This extends the existing structures rather than adding a parallel one:
-- profiles.verification_status already carries the four states the UI needs
-- (unverified / pending / verified / rejected) and stays the single source of
-- truth for "is this client verified". The new table records the submission
-- itself: what was sent, when, who reviewed it and why it was rejected.
--
-- A client can read their own submission and nothing else. Only an admin can
-- change a verification outcome, through the review function below, so a
-- client cannot mark themselves verified by any route.

create table if not exists public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  full_legal_name text not null,
  date_of_birth date,
  country text,
  address text,
  document_type text not null check (document_type in ('passport', 'national_id', 'drivers_license')),
  document_number text,
  document_path text,
  selfie_path text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_submissions_user_idx on public.kyc_submissions (user_id, submitted_at desc);
create index if not exists kyc_submissions_status_idx on public.kyc_submissions (status, submitted_at desc);

-- One open submission per client: a client cannot flood the review queue, and
-- re-submitting after a rejection is still allowed because that row is no
-- longer pending.
create unique index if not exists kyc_submissions_one_pending
  on public.kyc_submissions (user_id) where status = 'pending';

alter table public.kyc_submissions enable row level security;

drop policy if exists kyc_select_own on public.kyc_submissions;
create policy kyc_select_own on public.kyc_submissions
  for select using (user_id = (select auth.uid()));

drop policy if exists kyc_select_admin on public.kyc_submissions;
create policy kyc_select_admin on public.kyc_submissions
  for select using (public.is_admin());

-- No client insert/update/delete policy on purpose: submissions are created by
-- client_submit_kyc and reviewed by admin_review_kyc, both security definer.
drop policy if exists kyc_update_admin on public.kyc_submissions;
create policy kyc_update_admin on public.kyc_submissions
  for update using (public.is_admin()) with check (public.is_admin());

/* ---------- private bucket for identity documents ---------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same shape as the deposit-receipts policies: a client writes only into the
-- folder named after their own user id, and reads only their own files. An
-- admin may read any of them, which is what the signed-URL route relies on.
drop policy if exists kyc_docs_insert_own on storage.objects;
create policy kyc_docs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists kyc_docs_select_own_or_admin on storage.objects;
create policy kyc_docs_select_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

/* ---------- client: submit a verification request ---------- */

create or replace function public.client_submit_kyc(
  p_full_legal_name text,
  p_document_type text,
  p_date_of_birth date default null,
  p_country text default null,
  p_address text default null,
  p_document_number text default null,
  p_document_path text default null,
  p_selfie_path text default null
) returns public.kyc_submissions
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_row public.kyc_submissions; v_current text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select verification_status into v_current from public.profiles where id = v_uid;
  if v_current = 'verified' then raise exception 'Your account is already verified'; end if;
  if v_current = 'pending' then
    -- Already awaiting review: hand back the open submission instead of
    -- creating a second one.
    select * into v_row from public.kyc_submissions
      where user_id = v_uid and status = 'pending' order by submitted_at desc limit 1;
    if found then return v_row; end if;
  end if;

  if coalesce(trim(p_full_legal_name), '') = '' then raise exception 'Your full legal name is required'; end if;
  if p_document_type not in ('passport', 'national_id', 'drivers_license') then
    raise exception 'Choose one of the accepted document types';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > (current_date - interval '18 years') then
    raise exception 'You must be at least 18 years old to use this platform';
  end if;
  -- A document must be one this client uploaded into their own folder.
  if p_document_path is not null and p_document_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_.-]+$') then
    raise exception 'Invalid document';
  end if;
  if p_selfie_path is not null and p_selfie_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_.-]+$') then
    raise exception 'Invalid document';
  end if;

  insert into public.kyc_submissions (
    user_id, full_legal_name, date_of_birth, country, address,
    document_type, document_number, document_path, selfie_path
  ) values (
    v_uid, trim(p_full_legal_name), p_date_of_birth, nullif(trim(p_country), ''), nullif(trim(p_address), ''),
    p_document_type, nullif(trim(p_document_number), ''), p_document_path, p_selfie_path
  ) returning * into v_row;

  update public.profiles set verification_status = 'pending', updated_at = now() where id = v_uid;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'kyc_submitted', 'kyc_submission', v_row.id::text,
          jsonb_build_object('submission_id', v_row.id, 'document_type', p_document_type));

  return v_row;
end $$;

/* ---------- admin: verify or reject a submission ---------- */

create or replace function public.admin_review_kyc(p_submission_id uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_row public.kyc_submissions; v_status text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('verify', 'reject') then raise exception 'Action must be verify or reject'; end if;

  select * into v_row from public.kyc_submissions where id = p_submission_id for update;
  if not found then raise exception 'Verification request not found'; end if;
  if v_row.status <> 'pending' then raise exception 'This request was already %', v_row.status; end if;
  if p_action = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting a verification request';
  end if;

  v_status := case when p_action = 'verify' then 'verified' else 'rejected' end;

  update public.kyc_submissions
    set status = v_status, reviewed_at = now(), reviewed_by = v_admin,
        rejection_reason = case when p_action = 'reject' then trim(p_reason) else null end,
        updated_at = now()
  where id = p_submission_id;

  -- The client-facing state only changes once the row above is written.
  update public.profiles set verification_status = v_status, updated_at = now() where id = v_row.user_id;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, v_row.user_id, 'kyc_' || v_status, 'kyc_submission', p_submission_id::text,
          jsonb_build_object('submission_id', p_submission_id, 'client_id', v_row.user_id,
                             'reason', nullif(trim(p_reason), '')));

  return v_status;
end $$;

/* ---------- client: read own verification state ---------- */

create or replace function public.client_kyc_status()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_row public.kyc_submissions; v_status text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select verification_status into v_status from public.profiles where id = v_uid;
  select * into v_row from public.kyc_submissions where user_id = v_uid order by submitted_at desc limit 1;
  return jsonb_build_object(
    'status', coalesce(v_status, 'unverified'),
    'submitted_at', v_row.submitted_at,
    'reviewed_at', v_row.reviewed_at,
    'rejection_reason', v_row.rejection_reason,
    'document_type', v_row.document_type,
    'full_legal_name', v_row.full_legal_name
  );
end $$;

revoke all on function public.client_submit_kyc(text, text, date, text, text, text, text, text) from public, anon;
revoke all on function public.admin_review_kyc(uuid, text, text) from public, anon;
revoke all on function public.client_kyc_status() from public, anon;
grant execute on function public.client_submit_kyc(text, text, date, text, text, text, text, text) to authenticated;
grant execute on function public.admin_review_kyc(uuid, text, text) to authenticated;
grant execute on function public.client_kyc_status() to authenticated;

grant select on public.kyc_submissions to authenticated;

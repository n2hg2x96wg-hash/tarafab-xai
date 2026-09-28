-- A client's profile can carry a verification status that was set by an admin
-- before the KYC form existed. That is not a submission: there are no details
-- and no documents behind it. Reporting it as "pending review" left such a
-- client looking at a waiting message with no way to send anything, and gave
-- the admin nothing to review.
--
-- client_kyc_status now says whether a real submission exists, so the page can
-- offer the form whenever one does not. Nothing is deleted and no profile
-- status is rewritten: the existing records stay exactly as they are.

create or replace function public.client_kyc_status()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_row public.kyc_submissions; v_status text; v_found boolean;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select verification_status into v_status from public.profiles where id = v_uid;
  select * into v_row from public.kyc_submissions where user_id = v_uid order by submitted_at desc limit 1;
  v_found := found;
  return jsonb_build_object(
    -- Without a submission the client has genuinely not applied yet, whatever
    -- the profile happens to say.
    'status', case when v_found then v_row.status else 'unverified' end,
    'profile_status', coalesce(v_status, 'unverified'),
    'has_submission', v_found,
    'submitted_at', v_row.submitted_at,
    'reviewed_at', v_row.reviewed_at,
    'rejection_reason', v_row.rejection_reason,
    'document_type', v_row.document_type,
    'full_legal_name', v_row.full_legal_name
  );
end $$;

-- Submitting is gated on a real open submission rather than the profile status,
-- so a client carrying a legacy 'pending' profile can still apply. A repeated
-- submit (double tap, retry after a dropped connection) returns the submission
-- already recorded instead of failing or creating a second one.
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
declare v_uid uuid := auth.uid(); v_row public.kyc_submissions;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  -- An open request already exists: hand it back rather than opening a second.
  select * into v_row from public.kyc_submissions
    where user_id = v_uid and status in ('pending', 'under_review')
    order by submitted_at desc limit 1;
  if found then return v_row; end if;

  if exists (select 1 from public.kyc_submissions where user_id = v_uid and status = 'verified') then
    raise exception 'Your account is already verified';
  end if;

  if coalesce(trim(p_full_legal_name), '') = '' then raise exception 'Your full legal name is required'; end if;
  if p_document_type not in ('passport', 'national_id', 'drivers_license') then
    raise exception 'Choose one of the accepted document types';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > (current_date - interval '18 years') then
    raise exception 'You must be at least 18 years old to use this platform';
  end if;
  if p_document_path is null then raise exception 'A photo of your document is required'; end if;
  -- A document must be one this client uploaded into their own folder.
  if p_document_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_./-]+$') then
    raise exception 'Invalid document';
  end if;
  if p_selfie_path is not null and p_selfie_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_./-]+$') then
    raise exception 'Invalid document';
  end if;

  begin
    insert into public.kyc_submissions (
      user_id, full_legal_name, date_of_birth, country, address,
      document_type, document_number, document_path, selfie_path
    ) values (
      v_uid, trim(p_full_legal_name), p_date_of_birth, nullif(trim(p_country), ''), nullif(trim(p_address), ''),
      p_document_type, nullif(trim(p_document_number), ''), p_document_path, p_selfie_path
    ) returning * into v_row;
  exception when unique_violation then
    -- Two submits raced: return the one that won.
    select * into v_row from public.kyc_submissions
      where user_id = v_uid and status in ('pending', 'under_review')
      order by submitted_at desc limit 1;
    return v_row;
  end;

  update public.profiles set verification_status = 'pending', updated_at = now() where id = v_uid;

  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_uid, v_uid, v_uid, 'kyc_submitted', 'kyc_submission', v_row.id::text,
          jsonb_build_object('submission_id', v_row.id, 'document_type', p_document_type));

  return v_row;
end $$;

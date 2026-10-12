-- Client nickname / display name, kept separate from the legal name.
--
-- Additive and backward compatible: a new nullable column (existing rows stay
-- null, so everyone keeps seeing their existing name) and one function.
-- profiles.full_name (the legal / account name, used by admin, KYC and
-- withdrawals) is never touched here.
--
-- Clients still have no UPDATE right on profiles (only admins do, through
-- profiles_update_admin), so they cannot change full_name, role or any status
-- column. The only way a client changes a profile is set_my_display_name,
-- which writes display_name on the caller's own row (auth.uid()) and nothing
-- else.

alter table public.profiles add column if not exists display_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_display_name_check
      check (display_name is null or (char_length(display_name) between 1 and 40 and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]]'));
  end if;
end $$;

-- Sets (or, with null / blank, clears) the caller's own display name.
-- Whitespace is trimmed and inner runs collapsed to one space. Messages are
-- written for clients (SQLSTATE P0001 is shown as is by the API).
create or replace function public.set_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'Use 40 characters or fewer for your nickname.';
  end if;
  if v_name is not null and v_name ~ '[[:cntrl:]]' then
    raise exception 'Your nickname contains characters we cannot accept.';
  end if;
  update public.profiles set display_name = v_name where id = v_uid;
  if not found then
    raise exception 'Your profile could not be found.';
  end if;
  return v_name;
end;
$$;

revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;

-- Investment notifications. Additive; existing notifications are untouched.
--
-- 1. New notification type 'investment' (existing types stay valid).
-- 2. Optional link from a notification to ONE investment. It only makes the
--    client's button open that investment; what the client can see is still
--    decided by row level security on client_investments, so an id belonging
--    to someone else shows nothing.
-- 3. Investment lifecycle notifications are created by a trigger from REAL
--    status changes (activated, rejected, completed, expired), addressed only
--    to the investment's owner. Nothing is fabricated.

alter table public.client_notifications drop constraint if exists client_notifications_type_check;
alter table public.client_notifications add constraint client_notifications_type_check
  check (type in ('account', 'deposit', 'withdrawal', 'security', 'announcement', 'investment'));

alter table public.client_notifications
  add column if not exists investment_id uuid references public.client_investments (id) on delete set null;
create index if not exists client_notifications_investment_idx on public.client_notifications (investment_id) where investment_id is not null;

-- Admin composer: same rules as before, plus an optional investment link that
-- must belong to the addressed client.
drop function if exists public.admin_send_notification(uuid, text, text, text, text, text);
create or replace function public.admin_send_notification(
  p_user_id uuid, p_type text, p_title text, p_body text, p_cta_label text default null, p_cta_target text default null,
  p_investment_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_user_id is not null and not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Client not found'; end if;
  if (nullif(trim(p_cta_label), '') is null) <> (nullif(trim(p_cta_target), '') is null) then
    raise exception 'A button needs both a label and a link';
  end if;
  if p_investment_id is not null then
    if p_user_id is null then raise exception 'Link an investment only when sending to one client'; end if;
    if not exists (select 1 from public.client_investments where id = p_investment_id and user_id = p_user_id) then
      raise exception 'That investment does not belong to this client';
    end if;
  end if;
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, created_by, investment_id)
  values (p_user_id, p_type, trim(p_title), coalesce(trim(p_body), ''), nullif(trim(p_cta_label), ''), nullif(trim(p_cta_target), ''), v_admin, p_investment_id)
  returning id into v_id;
  insert into public.audit_logs (user_id, actor_id, target_user_id, action, entity, entity_id, details)
  values (v_admin, v_admin, p_user_id, 'admin_notification_sent', 'client_notifications', v_id::text,
          jsonb_build_object('type', p_type, 'title', trim(p_title), 'audience', coalesce(p_user_id::text, 'all_clients'),
                             'investment_id', p_investment_id));
  return v_id;
end $$;
revoke all on function public.admin_send_notification(uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.admin_send_notification(uuid, text, text, text, text, text, uuid) to authenticated;

create or replace function public._notify_investment_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_title text; v_body text; v_ref text := coalesce(new.reference, 'your investment');
begin
  if new.status = old.status then return new; end if;
  select name into v_name from public.investment_product_versions where id = new.product_version_id;
  v_name := coalesce(v_name, 'Investment');
  if new.status = 'active' and old.status in ('pending_activation', 'approved') then
    v_title := 'Investment approved';
    v_body := v_ref || ' (' || v_name || ') has been approved and is now active.';
  elsif new.status = 'rejected' then
    v_title := 'Investment request rejected';
    v_body := v_ref || ' (' || v_name || ') was not approved. The held amount is back in your available balance.'
              || coalesce(' Reason: ' || left(new.rejection_reason, 400), '');
  elsif new.status = 'completed' then
    v_title := 'Investment completed';
    v_body := v_ref || ' (' || v_name || ') has been completed and the principal returned to your available balance.';
  elsif new.status = 'expired' then
    v_title := 'Investment request expired';
    v_body := v_ref || ' (' || v_name || ') expired before it was processed. The held amount is back in your available balance.';
  else
    return new;
  end if;
  insert into public.client_notifications (user_id, type, title, body, cta_label, cta_target, investment_id)
  values (new.user_id, 'investment', v_title, v_body, 'View investment', '#investments', new.id);
  return new;
end $$;
revoke execute on function public._notify_investment_status() from public, anon, authenticated;
drop trigger if exists client_investments_notify on public.client_investments;
create trigger client_investments_notify after update of status on public.client_investments
  for each row execute function public._notify_investment_status();

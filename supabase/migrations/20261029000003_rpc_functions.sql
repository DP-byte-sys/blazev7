-- Trusted write path. Every function re-checks identity, permission, scope, state and input,
-- and commits the data change together with its audit event.

create function private.transition_allowed(p_from public.ticket_status, p_to public.ticket_status) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (
    ('new', 'acknowledged'), ('acknowledged', 'in_progress'), ('in_progress', 'resolved'),
    ('resolved', 'reopened'), ('reopened', 'acknowledged'), ('reopened', 'in_progress'))
$$;

create function private.add_event(p_ticket_id uuid, p_type text, p_old jsonb, p_new jsonb, p_reason text, p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ticket_events (ticket_id, actor_id, event_type, old_value, new_value, reason, visible_to_requester)
  values (p_ticket_id, auth.uid(), p_type, p_old, p_new, p_reason, p_visible);
end $$;

-- Locks the ticket row, hides tickets the caller cannot see, and rejects stale versions.
create function private.lock_ticket(p_id uuid, p_expected_version integer) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  if auth.uid() is null or private.my_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into t from public.tickets where id = p_id for update;
  if not found or not (t.requester_id = auth.uid() or private.staff_in_scope(t.assignee_id, t.team_id)) then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if p_expected_version is null or t.version <> p_expected_version then
    raise exception 'stale_version' using errcode = '40001';
  end if;
  return t;
end $$;

create function private.do_transition(t public.tickets, p_to public.ticket_status, p_event text, p_reason text, p_summary text)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare n public.tickets;
begin
  if not private.transition_allowed(t.status, p_to) then
    raise exception 'invalid_transition: % -> %', t.status, p_to using errcode = '22023';
  end if;
  update public.tickets
     set status = p_to, version = version + 1, updated_at = now(),
         resolution_summary = coalesce(p_summary, resolution_summary)
   where id = t.id returning * into n;
  perform private.add_event(t.id, p_event, jsonb_build_object('status', t.status), jsonb_build_object('status', n.status), p_reason, true);
  return n;
end $$;

create function public.create_ticket(
  p_client_request_id uuid, p_category_id uuid, p_title text, p_description text,
  p_priority public.ticket_priority default 'normal')
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare
  c public.ticket_categories; t public.tickets;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
begin
  if auth.uid() is null or private.my_role() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'invalid_input: client_request_id is required' using errcode = '22023'; end if;
  -- Retry/double-tap with the same key returns the original ticket instead of creating a duplicate.
  select * into t from public.tickets where requester_id = auth.uid() and client_request_id = p_client_request_id;
  if found then return t; end if;
  if length(v_title) not between 1 and 200 then raise exception 'invalid_input: title must be 1-200 characters' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 5000 then raise exception 'invalid_input: description must be 1-5000 characters' using errcode = '22023'; end if;
  select * into c from public.ticket_categories where id = p_category_id and active;
  if not found then raise exception 'invalid_input: unknown or inactive category' using errcode = '22023'; end if;
  begin
    insert into public.tickets (requester_id, category_id, team_id, title, description, priority, client_request_id)
    values (auth.uid(), c.id, c.default_team_id, v_title, v_desc, p_priority, p_client_request_id)
    returning * into t;
  exception when unique_violation then
    select * into t from public.tickets where requester_id = auth.uid() and client_request_id = p_client_request_id;
    return t;
  end;
  perform private.add_event(t.id, 'ticket_created', null,
    jsonb_build_object('status', t.status, 'priority', t.priority, 'category_id', t.category_id), null, true);
  return t;
end $$;

create function public.acknowledge_ticket(p_ticket_id uuid, p_expected_version integer)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  t := private.lock_ticket(p_ticket_id, p_expected_version);
  if not private.staff_in_scope(t.assignee_id, t.team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.do_transition(t, 'acknowledged', 'acknowledged', null, null);
end $$;

create function public.start_work(p_ticket_id uuid, p_expected_version integer)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  t := private.lock_ticket(p_ticket_id, p_expected_version);
  if not private.staff_in_scope(t.assignee_id, t.team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.do_transition(t, 'in_progress', 'work_started', null, null);
end $$;

create function public.resolve_ticket(p_ticket_id uuid, p_summary text, p_expected_version integer)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_summary text := btrim(coalesce(p_summary, ''));
begin
  t := private.lock_ticket(p_ticket_id, p_expected_version);
  if not private.staff_in_scope(t.assignee_id, t.team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_summary) not between 1 and 2000 then raise exception 'invalid_input: resolution summary is required' using errcode = '22023'; end if;
  return private.do_transition(t, 'resolved', 'resolved', null, v_summary);
end $$;

-- Requester of the ticket or in-scope staff may reopen; a reason is mandatory.
create function public.reopen_ticket(p_ticket_id uuid, p_reason text, p_expected_version integer)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_reason text := btrim(coalesce(p_reason, ''));
begin
  t := private.lock_ticket(p_ticket_id, p_expected_version);
  if not (t.requester_id = auth.uid() or private.staff_in_scope(t.assignee_id, t.team_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_reason) not between 1 and 1000 then raise exception 'invalid_input: a reason is required to reopen' using errcode = '22023'; end if;
  return private.do_transition(t, 'reopened', 'reopened', v_reason, null);
end $$;

-- Assign/reassign: in-scope staff only; target must be an active agent/supervisor in the ticket's team.
create function public.assign_ticket(p_ticket_id uuid, p_assignee_id uuid, p_expected_version integer, p_reason text default null)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets; n public.tickets; a public.profiles;
begin
  t := private.lock_ticket(p_ticket_id, p_expected_version);
  if not private.staff_in_scope(t.assignee_id, t.team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status = 'resolved' then raise exception 'invalid_transition: cannot assign a resolved ticket' using errcode = '22023'; end if;
  select * into a from public.profiles where id = p_assignee_id and active and role in ('agent', 'supervisor');
  if not found then raise exception 'invalid_input: assignee must be an active agent or supervisor' using errcode = '22023'; end if;
  if t.team_id is not null and not exists (select 1 from public.team_members m where m.team_id = t.team_id and m.user_id = a.id) then
    raise exception 'invalid_input: assignee is not in the ticket team' using errcode = '22023';
  end if;
  if t.assignee_id is not distinct from a.id then raise exception 'invalid_input: ticket is already assigned to this user' using errcode = '22023'; end if;
  update public.tickets set assignee_id = a.id, version = version + 1, updated_at = now() where id = t.id returning * into n;
  perform private.add_event(t.id, case when t.assignee_id is null then 'assigned' else 'reassigned' end,
    jsonb_build_object('assignee_id', t.assignee_id), jsonb_build_object('assignee_id', n.assignee_id), nullif(btrim(coalesce(p_reason, '')), ''), true);
  return n;
end $$;

create function public.add_comment(p_ticket_id uuid, p_body text, p_visibility public.comment_visibility default 'public')
returns public.ticket_comments language plpgsql security definer set search_path = '' as $$
declare t public.tickets; c public.ticket_comments; v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null or private.my_role() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from public.tickets where id = p_ticket_id;
  if not found or not (t.requester_id = auth.uid() or private.staff_in_scope(t.assignee_id, t.team_id)) then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if p_visibility = 'internal' and not private.staff_in_scope(t.assignee_id, t.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_body) not between 1 and 5000 then raise exception 'invalid_input: comment must be 1-5000 characters' using errcode = '22023'; end if;
  insert into public.ticket_comments (ticket_id, author_id, body, visibility) values (t.id, auth.uid(), v_body, p_visibility) returning * into c;
  update public.tickets set updated_at = now() where id = t.id; -- does not bump version: comments never cause stale-edit conflicts
  perform private.add_event(t.id, 'comment_added', null, jsonb_build_object('comment_id', c.id, 'visibility', c.visibility), null, c.visibility = 'public');
  return c;
end $$;

create function public.update_own_profile(p_display_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null or private.my_role() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_name) not between 1 and 100 then raise exception 'invalid_input: display name must be 1-100 characters' using errcode = '22023'; end if;
  update public.profiles set display_name = v_name, updated_at = now() where id = auth.uid() returning * into p;
  return p;
end $$;

-- ---- Admin flows (audited, admin only, never self-targeting for role/active changes) ----

create function private.require_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create function public.admin_set_user_role(p_user_id uuid, p_role public.app_role) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare old public.profiles; p public.profiles;
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then raise exception 'forbidden: admins cannot change their own role' using errcode = '42501'; end if;
  select * into old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'invalid_input: unknown user' using errcode = '22023'; end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id returning * into p;
  insert into public.admin_audit_events (actor_id, action, target_type, target_id, old_value, new_value)
  values (auth.uid(), 'user_role_changed', 'profile', p_user_id, jsonb_build_object('role', old.role), jsonb_build_object('role', p.role));
  return p;
end $$;

create function public.admin_set_user_active(p_user_id uuid, p_active boolean) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare old public.profiles; p public.profiles;
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then raise exception 'forbidden: admins cannot deactivate themselves' using errcode = '42501'; end if;
  select * into old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'invalid_input: unknown user' using errcode = '22023'; end if;
  update public.profiles set active = p_active, updated_at = now() where id = p_user_id returning * into p;
  insert into public.admin_audit_events (actor_id, action, target_type, target_id, old_value, new_value)
  values (auth.uid(), 'user_active_changed', 'profile', p_user_id, jsonb_build_object('active', old.active), jsonb_build_object('active', p.active));
  return p;
end $$;

create function public.admin_upsert_category(
  p_id uuid, p_name text, p_description text, p_active boolean, p_sort_order integer, p_default_team_id uuid)
returns public.ticket_categories language plpgsql security definer set search_path = '' as $$
declare old public.ticket_categories; c public.ticket_categories;
begin
  perform private.require_admin();
  if p_id is null then
    insert into public.ticket_categories (name, description, active, sort_order, default_team_id)
    values (p_name, p_description, coalesce(p_active, true), coalesce(p_sort_order, 0), p_default_team_id) returning * into c;
    insert into public.admin_audit_events (actor_id, action, target_type, target_id, new_value)
    values (auth.uid(), 'category_created', 'ticket_category', c.id, to_jsonb(c));
  else
    select * into old from public.ticket_categories where id = p_id for update;
    if not found then raise exception 'invalid_input: unknown category' using errcode = '22023'; end if;
    update public.ticket_categories
       set name = p_name, description = p_description, active = coalesce(p_active, active),
           sort_order = coalesce(p_sort_order, sort_order), default_team_id = p_default_team_id, updated_at = now()
     where id = p_id returning * into c;
    insert into public.admin_audit_events (actor_id, action, target_type, target_id, old_value, new_value)
    values (auth.uid(), 'category_updated', 'ticket_category', c.id, to_jsonb(old), to_jsonb(c));
  end if;
  return c;
end $$;

create function public.admin_set_team_member(p_team_id uuid, p_user_id uuid, p_member boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.teams where id = p_team_id) then raise exception 'invalid_input: unknown team' using errcode = '22023'; end if;
  if p_member then
    if not exists (select 1 from public.profiles where id = p_user_id and active and role in ('agent', 'supervisor')) then
      raise exception 'invalid_input: only active agents or supervisors can join a team' using errcode = '22023';
    end if;
    insert into public.team_members (team_id, user_id) values (p_team_id, p_user_id) on conflict do nothing;
  else
    delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
  end if;
  insert into public.admin_audit_events (actor_id, action, target_type, target_id, new_value)
  values (auth.uid(), 'team_membership_changed', 'team', p_team_id, jsonb_build_object('user_id', p_user_id, 'member', p_member));
end $$;

-- Execute privileges. Functions get PUBLIC execute by default, so revoke explicitly, then grant only what is needed.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- RLS policies call these as the querying user.
grant execute on function private.my_role(), private.is_staff(), private.is_admin(), private.in_team(uuid),
  private.staff_in_scope(uuid, uuid), private.can_view_ticket(uuid), private.staff_scope_of_ticket(uuid) to authenticated;

-- The only client-callable API: authenticated users, via supabase.rpc(...). anon gets nothing.
grant execute on function
  public.create_ticket(uuid, uuid, text, text, public.ticket_priority),
  public.acknowledge_ticket(uuid, integer), public.start_work(uuid, integer),
  public.resolve_ticket(uuid, text, integer), public.reopen_ticket(uuid, text, integer),
  public.assign_ticket(uuid, uuid, integer, text),
  public.add_comment(uuid, text, public.comment_visibility), public.update_own_profile(text),
  public.admin_set_user_role(uuid, public.app_role), public.admin_set_user_active(uuid, boolean),
  public.admin_upsert_category(uuid, text, text, boolean, integer, uuid),
  public.admin_set_team_member(uuid, uuid, boolean)
  to authenticated;

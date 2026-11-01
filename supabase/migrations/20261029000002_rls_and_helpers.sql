-- Access helpers + Row Level Security. Helpers are SECURITY DEFINER with a fixed search_path.

create function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('agent', 'supervisor', 'admin'), false)
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false)
$$;

create function private.in_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = p_team_id and m.user_id = auth.uid())
$$;

-- Staff scope: admins see everything; agents/supervisors see their teams' tickets and tickets assigned to them.
create function private.staff_in_scope(p_assignee_id uuid, p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: SQL NULL must never leak out as "unknown"; callers use `if not ...` and RLS, so always return true/false.
  select coalesce(
    case private.my_role()
      when 'admin' then true
      when 'agent' then coalesce(p_assignee_id = auth.uid(), false) or coalesce(p_team_id is not null and private.in_team(p_team_id), false)
      when 'supervisor' then coalesce(p_assignee_id = auth.uid(), false) or coalesce(p_team_id is not null and private.in_team(p_team_id), false)
      else false
    end, false)
$$;

create function private.can_view_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_role() is not null and exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id
      and (t.requester_id = auth.uid() or private.staff_in_scope(t.assignee_id, t.team_id)))
$$;

-- Internal notes/events are visible only to staff who are in scope of THAT ticket
-- (a staff member who is merely the requester of a ticket does not see internal notes about it).
create function private.staff_scope_of_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id and private.staff_in_scope(t.assignee_id, t.team_id))
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_events enable row level security;
alter table public.admin_audit_events enable row level security;

-- Read-only policies. There are deliberately NO insert/update/delete policies for API roles.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_staff());
create policy teams_read on public.teams for select to authenticated
  using (private.is_staff());
create policy team_members_read on public.team_members for select to authenticated
  using (user_id = auth.uid() or private.is_staff());
create policy categories_read on public.ticket_categories for select to authenticated
  using (private.my_role() is not null and (active or private.is_staff()));
create policy tickets_read on public.tickets for select to authenticated
  using (private.my_role() is not null and (requester_id = auth.uid() or private.staff_in_scope(assignee_id, team_id)));
create policy comments_read on public.ticket_comments for select to authenticated
  using (private.can_view_ticket(ticket_id) and (visibility = 'public' or private.staff_scope_of_ticket(ticket_id)));
create policy events_read on public.ticket_events for select to authenticated
  using (private.can_view_ticket(ticket_id) and (visible_to_requester or private.staff_scope_of_ticket(ticket_id)));
create policy admin_audit_read on public.admin_audit_events for select to authenticated
  using (private.is_admin());

-- Table privileges: API roles can only SELECT (further limited by RLS above). anon gets nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.teams, public.team_members, public.ticket_categories,
  public.tickets, public.ticket_comments, public.ticket_events, public.admin_audit_events to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.my_role(), private.is_staff(), private.is_admin(), private.in_team(uuid),
  private.staff_in_scope(uuid, uuid), private.can_view_ticket(uuid), private.staff_scope_of_ticket(uuid) to authenticated;

-- Assignment events carry the assignee id and an internal free-text reason, so they are staff-only.
-- Requesters see the lifecycle (created, acknowledged, work started, resolved, reopened) but not who handled it or why.
-- (CREATE OR REPLACE keeps the existing execute privileges.)

-- Assign/reassign: in-scope staff only; target must be an active agent/supervisor in the ticket's team.
create or replace function public.assign_ticket(p_ticket_id uuid, p_assignee_id uuid, p_expected_version integer, p_reason text default null)
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
    jsonb_build_object('assignee_id', t.assignee_id), jsonb_build_object('assignee_id', n.assignee_id), nullif(btrim(coalesce(p_reason, '')), ''), false);
  return n;
end $$;


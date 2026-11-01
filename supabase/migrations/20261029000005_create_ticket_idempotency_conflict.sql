-- Phase 4: a retry with the same client_request_id must be the SAME request.
-- Same key + same payload  -> return the original ticket (safe retry / double-tap).
-- Same key + different text -> reject with idempotency_conflict (never silently drop the newer text).
create or replace function public.create_ticket(
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

  select * into t from public.tickets where requester_id = auth.uid() and client_request_id = p_client_request_id;
  if found then
    if t.category_id is distinct from p_category_id or t.title <> v_title or t.description <> v_desc or t.priority <> p_priority then
      raise exception 'idempotency_conflict: this request key was already used with different content' using errcode = '22023';
    end if;
    return t;
  end if;

  if length(v_title) not between 1 and 200 then raise exception 'invalid_input: title must be 1-200 characters' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 5000 then raise exception 'invalid_input: description must be 1-5000 characters' using errcode = '22023'; end if;
  select * into c from public.ticket_categories where id = p_category_id and active;
  if not found then raise exception 'invalid_input: unknown or inactive category' using errcode = '22023'; end if;

  begin
    insert into public.tickets (requester_id, category_id, team_id, title, description, priority, client_request_id)
    values (auth.uid(), c.id, c.default_team_id, v_title, v_desc, p_priority, p_client_request_id)
    returning * into t;
  exception when unique_violation then
    -- lost a race with a parallel identical request: return the winner if the payload matches
    select * into t from public.tickets where requester_id = auth.uid() and client_request_id = p_client_request_id;
    if t.category_id is distinct from p_category_id or t.title <> v_title or t.description <> v_desc or t.priority <> p_priority then
      raise exception 'idempotency_conflict: this request key was already used with different content' using errcode = '22023';
    end if;
    return t;
  end;
  perform private.add_event(t.id, 'ticket_created', null,
    jsonb_build_object('status', t.status, 'priority', t.priority, 'category_id', t.category_id), null, true);
  return t;
end $$;

revoke execute on function public.create_ticket(uuid, uuid, text, text, public.ticket_priority) from public, anon;
grant execute on function public.create_ticket(uuid, uuid, text, text, public.ticket_priority) to authenticated;

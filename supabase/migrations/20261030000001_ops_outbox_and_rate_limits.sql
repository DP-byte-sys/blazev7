-- Phase 6 (reliability): transactional notification outbox + configurable rate limits.

-- ---------------------------------------------------------------- notification outbox
-- Provider-agnostic: rows say WHO should hear about WHICH event. No ticket text or names are stored
-- (so the outbox holds no personal content); a trusted worker looks up what it needs when it sends.
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'dead');

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.ticket_events (id),
  ticket_id uuid not null references public.tickets (id),
  recipient_id uuid not null references public.profiles (id),
  kind text not null check (kind in
    ('ticket_acknowledged', 'ticket_resolved', 'ticket_reopened', 'staff_reply', 'assigned_to_you', 'requester_reply', 'requester_reopened')),
  status public.notification_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500), -- error CODES only, never user content
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, recipient_id)
);
create index notification_outbox_due_idx on public.notification_outbox (status, next_attempt_at);

alter table public.notification_outbox enable row level security; -- no policies: API roles get nothing
revoke all on public.notification_outbox from anon, authenticated;

-- Written in the same transaction as the ticket event (transactional outbox): no event without its notification rows.
create function private.enqueue_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_kind text; v_to uuid;
begin
  select * into t from public.tickets where id = new.ticket_id;

  -- requester hears about staff actions that they are allowed to see
  if new.actor_id <> t.requester_id then
    v_kind := case new.event_type
      when 'acknowledged' then 'ticket_acknowledged'
      when 'resolved' then 'ticket_resolved'
      when 'reopened' then 'ticket_reopened'
      when 'comment_added' then case when new.visible_to_requester then 'staff_reply' end
    end;
    if v_kind is not null then
      insert into public.notification_outbox (event_id, ticket_id, recipient_id, kind) values (new.id, t.id, t.requester_id, v_kind)
      on conflict do nothing;
    end if;
  end if;

  -- the assignee hears about being assigned, and about requester activity
  if new.event_type in ('assigned', 'reassigned') then
    v_to := nullif(new.new_value ->> 'assignee_id', '')::uuid;
    if v_to is not null and v_to <> new.actor_id then
      insert into public.notification_outbox (event_id, ticket_id, recipient_id, kind) values (new.id, t.id, v_to, 'assigned_to_you')
      on conflict do nothing;
    end if;
  elsif new.actor_id = t.requester_id and t.assignee_id is not null and t.assignee_id <> new.actor_id
        and new.event_type in ('comment_added', 'reopened') then
    insert into public.notification_outbox (event_id, ticket_id, recipient_id, kind)
    values (new.id, t.id, t.assignee_id, case new.event_type when 'reopened' then 'requester_reopened' else 'requester_reply' end)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger ticket_events_enqueue_notifications after insert on public.ticket_events
  for each row execute function private.enqueue_notifications();

-- Worker API (service role only; never callable from the apps). Safe for several workers at once (skip locked),
-- and rows stuck in 'processing' after a worker crash are reclaimed after 10 minutes.
create function public.claim_notifications(p_limit integer default 20) returns setof public.notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select id from public.notification_outbox
     where (status in ('pending', 'failed') and next_attempt_at <= now())
        or (status = 'processing' and claimed_at < now() - interval '10 minutes')
     order by id limit greatest(1, least(coalesce(p_limit, 20), 100)) for update skip locked)
  update public.notification_outbox o
     set status = 'processing', attempts = o.attempts + 1, claimed_at = now()
    from due where o.id = due.id
  returning o.*;
end $$;

create function public.complete_notification(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox set status = 'sent', processed_at = now(), last_error = null, claimed_at = null
   where id = p_id and status = 'processing'
$$;

-- Exponential backoff (2, 4, 8... minutes); after p_max_attempts the row becomes 'dead' for a human to look at.
create function public.fail_notification(p_id bigint, p_error text, p_max_attempts integer default 5) returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox
     set status = case when attempts >= p_max_attempts then 'dead'::public.notification_status else 'failed'::public.notification_status end,
         last_error = left(coalesce(p_error, 'unknown'), 500), claimed_at = null,
         next_attempt_at = now() + make_interval(mins => power(2, attempts)::integer)
   where id = p_id and status = 'processing'
$$;

-- ---------------------------------------------------------------- rate limits
-- Proposed defaults (see ADR 0007). Change with a normal migration or SQL by the project owner; never from the apps.
create table public.rate_limits (
  action text primary key check (action in ('create_ticket', 'add_comment')),
  max_count integer not null check (max_count > 0),
  window_seconds integer not null check (window_seconds > 0)
);
insert into public.rate_limits (action, max_count, window_seconds) values ('create_ticket', 20, 3600), ('add_comment', 60, 600);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
create index ticket_comments_author_idx on public.ticket_comments (author_id, created_at);

create function private.enforce_rate_limit(p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.rate_limits; n integer;
begin
  select * into l from public.rate_limits where action = p_action;
  if not found then return; end if;
  if p_action = 'create_ticket' then
    select count(*) into n from public.tickets where requester_id = auth.uid() and created_at > now() - make_interval(secs => l.window_seconds);
  else
    select count(*) into n from public.ticket_comments where author_id = auth.uid() and created_at > now() - make_interval(secs => l.window_seconds);
  end if;
  if n >= l.max_count then
    raise exception 'rate_limited: too many requests, please try again later' using errcode = '54000';
  end if;
end $$;

-- create_ticket: same behaviour as before, plus the limit. The idempotent-retry lookup comes first, so a retry of
-- a ticket that already exists is never blocked by the limit.
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
  perform private.enforce_rate_limit('create_ticket');

  begin
    insert into public.tickets (requester_id, category_id, team_id, title, description, priority, client_request_id)
    values (auth.uid(), c.id, c.default_team_id, v_title, v_desc, p_priority, p_client_request_id)
    returning * into t;
  exception when unique_violation then
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

create or replace function public.add_comment(p_ticket_id uuid, p_body text, p_visibility public.comment_visibility default 'public')
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
  perform private.enforce_rate_limit('add_comment');
  insert into public.ticket_comments (ticket_id, author_id, body, visibility) values (t.id, auth.uid(), v_body, p_visibility) returning * into c;
  update public.tickets set updated_at = now() where id = t.id; -- does not bump version: comments never cause stale-edit conflicts
  perform private.add_event(t.id, 'comment_added', null, jsonb_build_object('comment_id', c.id, 'visibility', c.visibility), null, c.visibility = 'public');
  return c;
end $$;

-- ---------------------------------------------------------------- privileges
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_role(), private.is_staff(), private.is_admin(), private.in_team(uuid),
  private.staff_in_scope(uuid, uuid), private.can_view_ticket(uuid), private.staff_scope_of_ticket(uuid) to authenticated;
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
-- worker API: service role only
grant usage on schema public to service_role;
grant execute on function public.claim_notifications(integer), public.complete_notification(bigint), public.fail_notification(bigint, text, integer) to service_role;

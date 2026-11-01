-- Blaze core schema (Phase 2). Clients get NO direct write access; all writes go through
-- SECURITY DEFINER functions in migration 3 so state changes and audit events commit together.

-- Objects created after this line get no automatic grants for API roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists private; -- not exposed through the API; holds helpers/internal functions
revoke all on schema private from public;

create type public.app_role as enum ('requester', 'agent', 'supervisor', 'admin');
create type public.ticket_status as enum ('new', 'acknowledged', 'in_progress', 'resolved', 'reopened');
create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.comment_visibility as enum ('public', 'internal');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  role public.app_role not null default 'requester',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  description text check (description is null or length(description) <= 500),
  active boolean not null default true,
  sort_order integer not null default 0,
  default_team_id uuid references public.teams (id), -- tickets in this category route to this team's queue
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.ticket_ref_seq;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BLZ-' || lpad(nextval('public.ticket_ref_seq')::text, 6, '0')),
  requester_id uuid not null references public.profiles (id),
  category_id uuid not null references public.ticket_categories (id),
  team_id uuid references public.teams (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null check (length(btrim(description)) between 1 and 5000),
  priority public.ticket_priority not null default 'normal',
  status public.ticket_status not null default 'new',
  assignee_id uuid references public.profiles (id),
  resolution_summary text check (resolution_summary is null or length(resolution_summary) <= 2000),
  version integer not null default 1, -- optimistic concurrency: transitions must pass the version they saw
  client_request_id uuid not null,    -- idempotency key from the client
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, client_request_id),
  constraint resolved_needs_summary check (status <> 'resolved' or length(btrim(coalesce(resolution_summary, ''))) > 0)
);
create index tickets_requester_idx on public.tickets (requester_id, created_at desc);
create index tickets_team_status_idx on public.tickets (team_id, status);
create index tickets_assignee_idx on public.tickets (assignee_id);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id),
  author_id uuid not null references public.profiles (id),
  body text not null check (length(btrim(body)) between 1 and 5000),
  visibility public.comment_visibility not null default 'public',
  created_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

create table public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id),
  actor_id uuid not null references public.profiles (id),
  event_type text not null check (event_type in
    ('ticket_created', 'acknowledged', 'work_started', 'assigned', 'reassigned', 'resolved', 'reopened', 'comment_added')),
  old_value jsonb,
  new_value jsonb,
  reason text,
  visible_to_requester boolean not null default true,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, id);

create table public.admin_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id),
  action text not null,
  target_type text not null,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- Append-only: nobody (including the table owner) can change or delete history rows.
create function private.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'append_only: % on % is not allowed', tg_op, tg_table_name using errcode = '42501';
end $$;
create trigger ticket_events_append_only before update or delete on public.ticket_events
  for each row execute function private.forbid_mutation();
create trigger ticket_comments_append_only before update or delete on public.ticket_comments
  for each row execute function private.forbid_mutation();
create trigger admin_audit_append_only before update or delete on public.admin_audit_events
  for each row execute function private.forbid_mutation();

-- Every new auth user gets a profile with the least-privileged role. Client metadata is ignored.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''), 'User'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

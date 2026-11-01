# ADR 0003: Phase 2 data model and access model

- Status: proposed, owner decisions recorded 2026-10-29; assumptions below need owner confirmation

## Owner decisions (confirmed in chat)

1. Agents see only tickets in their team's queue plus tickets assigned to them.
2. No `closed` status in V1; resolved tickets stay reopenable.
3. Requesters (with a reason) and in-scope staff can reopen resolved tickets.

## Design

- Clients have SELECT-only access (RLS). All writes go through SECURITY DEFINER functions (`public.*` RPCs) that re-check identity, role, scope, state and input, and write the audit event in the same transaction. Helpers and internal functions live in the unexposed `private` schema.
- Routing: each category has a `default_team_id`; new tickets copy it to `tickets.team_id`. Team queues are defined by `team_members` (agents/supervisors).
- Lifecycle matrix (enforced in `private.transition_allowed`): new->acknowledged->in_progress->resolved->reopened->acknowledged|in_progress.
- Optimistic concurrency: every transition/assignment takes the `version` the caller saw; mismatches fail with `stale_version`.
- Idempotency: `create_ticket` takes a client-generated `client_request_id`; retries return the original ticket.
- Audit: `ticket_events` (requester-visible flag per event), `admin_audit_events`; both, plus comments, are append-only via triggers.
- Roles: new users are always `requester` (trigger ignores client metadata). Role/active/team/category changes are admin-only RPCs, audited; admins cannot change their own role or deactivate themselves.

## Assumptions made (NOT decided by the owner; please confirm or change)

- A1: Admins can view and act on all tickets (otherwise an admin outside every team could not oversee queues).
- A2: Supervisors have the same team-based scope as agents (not global).
- A3: Comments are append-only in V1 (no edit/delete).
- A4: Assignment targets must be active agents/supervisors in the ticket's team; admins and requesters cannot be assignees; resolved tickets cannot be (re)assigned.
- A5: Any in-scope staff member (not only the assignee) can acknowledge, start work and resolve.
- A6: Requesters may set priority when creating a ticket.
- A7: Teams are created by seed/migration only for now (no admin RPC to create teams).
- A8: Ticket reference format is `BLZ-` + 6 digits from a database sequence (gaps are possible).
- A9: Resolution summary is kept when a ticket is reopened.

## Not decided / out of scope in Phase 2

Retention/deletion policy (deleting users is blocked while they own tickets), notifications, attachments, SLA timers, ticket editing by requesters after creation.

## Verification status

Tested on plain PostgreSQL (PGlite) with a stand-in for Supabase's `auth` schema and API roles. NOT yet verified with the real Supabase local stack (`supabase db reset`); the seed inserts only `id` and `email` into `auth.users`, which must be checked there.

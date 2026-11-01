# Blaze — Product Requirements Document

- Status: V1 baseline for AI-assisted development
- Version: 0.1
- Updated: 2026-10-28

## Vision

Blaze is a clear, dependable ticketing system. Requesters create issue tickets and track progress; support agents acknowledge, assign, reassign, investigate, resolve, and reopen tickets. Supervisors oversee queues; administrators manage categories, roles, and configuration.

## Product philosophy

1. Clarity over complexity.
2. One authoritative, auditable ticket history.
3. Security is enforced server-side, never only by hiding UI controls.
4. Prefer a modular app and managed services over premature microservices.
5. Mobile-first requester experience; responsive web workspace for agents/admins.
6. Offline states must be honest: local drafts are not submitted tickets.
7. AI-generated code is untrusted until tested and reviewed.
8. Free-tier-first, but do not assume free hosting provides production SLAs.

## Personas

- **Requester:** create tickets, view own tickets, read public updates, reopen when policy permits.
- **Agent:** view authorized queue, acknowledge, work, assign/reassign within scope, add public replies/internal notes, resolve and reopen when authorized.
- **Supervisor:** oversee queues, reassign work, manage escalations within scope.
- **Administrator:** manage users/roles, categories, priorities, workflow configuration and system settings.

New users default to the least-privileged `requester` role. Client-supplied role values must never grant privileges.

## V1 goals

- Authentication and protected routes.
- Ticket creation with title, description, category, priority and unique human-readable reference.
- Ticket list/detail and status timeline.
- Lifecycle transitions, assignment/reassignment, resolution summary and reopening reason.
- Public comments separated from internal notes.
- Role/permission model and auditable significant actions.
- Server-side validation, database access policies and tests.
- Repeatable builds, UAT, staging rehearsal, approved production deployment and recovery procedure.

## Scope

### P0 — required

Auth; roles; categories; priorities; create/list/detail tickets; lifecycle; assignment history; comments with visibility; resolution summary; audit timeline; loading/empty/error/offline states; input validation; authorization tests; versioned migrations; CI.

### P1 — after core flows

Attachments with private storage; email/push notifications; SLA timers/escalations; search/filter/pagination; supervisor dashboard; export; safe offline outbox sync.

### Out of scope for first release

Microservices, billing, AI auto-resolution, anonymous public submissions, real-time chat, complex workflow builder, app-store release before core security and workflows are proven.

## User stories and acceptance criteria

### Sign in

- Invalid credentials show a safe error.
- Signed-out users cannot read protected data.
- New accounts receive requester role.
- Session restore/sign-out work as documented.

### Create ticket

- Title, description and category are required.
- Server validates all input.
- Success shows ticket reference and authoritative status.
- Retry/double-tap does not silently create duplicates; use idempotency where supported.
- Offline draft is explicitly distinguished from submitted ticket.

### Track ticket

- Requesters can only read their own tickets unless sharing is explicitly designed.
- Internal notes are never exposed to requester views.
- Loading, empty, error and refresh states exist.

### Agent workflow

- Only authorized staff can acknowledge, assign/reassign, resolve or reopen.
- Assignment target must be an active eligible agent.
- Resolve requires a summary; reopen requires policy authorization and records a reason.
- Actor, timestamp, old/new values and reason are audited.
- Stale concurrent updates fail safely instead of silently overwriting newer data.

### Administration

- Only authorized admins manage roles and global categories.
- Admin actions are audited.
- Users cannot elevate their own roles through client requests or local state.

## Initial lifecycle

`new → acknowledged → in_progress → resolved → reopened → acknowledged/in_progress`
`resolved → closed` only if a closure stage is deliberately enabled. Invalid transitions are rejected by trusted backend logic, not just the UI.

## Non-functional requirements

- Least privilege, RLS, secure secrets, audit history and dependency scanning.
- Synthetic data outside production.
- Backups and tested restoration plan appropriate to the hosting tier.
- Accessible contrast, scalable text, keyboard support on web and touch-friendly mobile controls.
- Strict TypeScript, tests, migrations, structured logs without secrets/needless PII.
- Define performance and availability targets after expected usage and platform constraints are known.

## Success metrics

Ticket creation success; time to acknowledgement/resolution; reopen rate; reassignment count; denied unauthorized actions; API error/latency; CI/deployment success; change failure and recovery time.

## Release acceptance

- [ ] P0 stories pass.
- [ ] Tests/typecheck/build pass.
- [ ] Positive and negative permission tests pass.
- [ ] Migration reviewed and tested.
- [ ] No secrets/production data in Git.
- [ ] UAT scenarios recorded and approved.
- [ ] Staging smoke checks and recovery rehearsal pass.
- [ ] Monitoring and rollback/forward-fix plan exist.
- [ ] Production deployment explicitly approved.

## Open decisions

See `architecture.md` and `memory.md`. Major decisions must not be silently invented during implementation.

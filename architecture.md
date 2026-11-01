# Blaze — Technical Architecture

- Status: proposed baseline; verify package compatibility against current official docs before installation
- Version: 0.1
- Updated: 2026-10-28

## 1. Overview

Blaze has a React Native requester app and a React/TypeScript agent/admin web portal. Supabase provides managed PostgreSQL, authentication, storage and trusted server-side functions when required. Start with a modular application, not microservices.

## 2. Stack

### Mobile

- React Native + Expo
- Expo Router for file-based navigation
- TypeScript strict mode
- Zustand for transient UI/client state
- Expo SQLite for drafts, cache and an optional safe outbox
- Supabase JS client for authorized backend access
- React Hook Form and Zod are candidates for forms/validation after dependency review
- SecureStore or a provider-supported session storage adapter where appropriate

### Web

- React + TypeScript + Vite
- React Router if client routing is needed
- Shared types/validation from `packages/shared`
- Supabase client only with publishable/anon credentials and correctly tested RLS

### Backend/delivery

- Supabase PostgreSQL/Auth/Storage and server-side functions as needed
- Private GitHub repository and GitHub Actions CI
- Free-tier web host selected after reviewing current limits
- Supabase CLI/local stack for migrations and repeatable tests; Docker Desktop/WSL2 may be required on Windows
- Expo Go for development; use an appropriate build/distribution path for production mobile binaries

## 3. SQLite contract

SQLite is local persistence, **not** the system of record. Use it for drafts, justified caches and optional safe queued operations.

Rules:

1. A local draft is not a submitted ticket.
2. Queued writes remain pending until the backend confirms them.
3. Use operation IDs/idempotency keys for retryable writes where supported.
4. Never blindly queue privileged role changes or unsafe lifecycle transitions.
5. Revalidate user, permission and current server state on sync.
6. Handle conflicts explicitly; never silently overwrite newer server state.
7. Show `Local draft`, `Pending sync`, `Synced`, or `Sync failed`.
8. Do not store tokens/secrets in ordinary SQLite tables.
9. Define cache invalidation and sign-out cleanup so another local session cannot see prior user data.

The server is authoritative for ticket reference, status, assignment, permissions and audit history.

## 4. State management

Zustand is not an authorization layer and should not duplicate the entire server database. Use it for transient UI state, filters, selected queue, sync status and small cross-screen state. Avoid persisting sensitive state by default. Keep server reads/writes in feature-level repositories/services.

## 5. Logical data model (finalize before migrations)

- `profiles`: auth user ID, display name, role or role relationship, active flag, timestamps.
- `ticket_categories`: name, description, active flag, sort order, timestamps.
- `tickets`: UUID, unique human-readable ticket number, requester ID, category ID, title, description, priority, status, nullable assignee, nullable resolution summary, timestamps, optional version for optimistic concurrency.
- `ticket_comments`: ticket ID, author ID, body, visibility (`public`/`internal`), timestamp and policy-defined edit/delete metadata.
- `ticket_events` / `ticket_audit_events`: ticket ID, actor, event type, old/new values or structured metadata, reason and timestamp. Append-only for normal application roles.
- Future candidates: teams/memberships, attachments, notification outbox, SLA policies, idempotency keys.

Audit creation, transitions, assignment/reassignment, resolution, reopening and privileged admin actions. Current-state columns alone are not an audit trail.

## 6. Lifecycle and concurrency

Centralize a typed transition matrix and enforce it in trusted backend logic. UI may display available actions but cannot be final authority. Use transactions and/or optimistic concurrency checks. Validate that assignment targets are active and in actor scope. Commit state and audit event together; otherwise reject the operation.

## 7. Security

- Enable RLS on every client-accessible table.
- Requesters read only their own tickets and public comments/events intended for them.
- Agent scope must be explicit (team/queue policy) unless broad visibility is deliberately approved.
- Internal notes are staff-only.
- Role changes and global configuration require trusted admin flows.
- Validate payloads at trusted boundaries.
- Attachments use private storage and appropriately scoped access.
- Secrets live in environment-specific secret stores.
- Never ship a service-role key in mobile/browser code.
- Log security events without tokens, credentials or unnecessary PII.
- Test denied access, not only successful operations.

## 8. Data flow

### Read

Screen → feature repository → local cache when appropriate → authorized backend read → render honest loading/error/stale states → update cache.

### Write

UI validation → feature service → trusted backend validates identity/permissions/state/input → data and audit event commit atomically → typed success/error/conflict returned → UI updates from authoritative response → local cache/outbox updated under sync rules.

Do not spread ad hoc database mutations across screens.

## 9. Folder structure

```text
blaze/
├── apps/
│   ├── mobile/
│   │   ├── app/                 # Expo Router routes/layouts
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/auth/
│   │   │   ├── features/tickets/
│   │   │   ├── db/
│   │   │   ├── repositories/
│   │   │   ├── services/
│   │   │   ├── store/
│   │   │   ├── theme/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   ├── assets/
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   ├── layouts/
│       │   ├── repositories/
│       │   ├── services/
│       │   ├── theme/
│       │   └── types/
│       └── package.json
├── packages/shared/
├── supabase/migrations/
├── supabase/functions/
├── supabase/seed.sql
├── tests/
├── docs/
├── .github/workflows/
├── prd.md
├── design.md
├── phases.md
├── architecture.md
└── memory.md
```

## 10. Conventions

- Strict TypeScript; avoid `any` unless justified.
- Feature-oriented modules; no giant components or dumping-ground utils.
- Screens compose UI; services/repositories own data operations.
- Keep pure business rules unit-testable.
- Use typed errors/results; do not swallow failures.
- Schema changes use new migrations; never rewrite already-applied migrations.
- Store timestamps in UTC; format locally in UI.
- Use stable IDs, pagination, validation at client and trusted server boundaries.
- Do not show optimistic success for sensitive mutations.
- Centralize design tokens.
- Never commit `.env`, credentials, customer exports or production data.
- Verify Expo SDK and native package compatibility before upgrading.
- Record significant changes as short architecture decision records.

## 11. Environment/deployment model

- **DEV:** local apps and local Supabase where possible; synthetic seed data.
- **UAT:** isolated non-production backend/project and test accounts.
- **Staging:** production-like release rehearsal; may initially be local/temporary due to free-tier limits.
- **PROD:** separate project, credentials, access policy, storage and real data.

Environment separation is not just different `.env` labels. Keep databases, credentials, storage/auth configuration and access controls separate.

Promotion: PR checks → reviewed merge → DEV verification → recorded UAT acceptance → staging smoke/migration/recovery checks → explicit production approval → deploy and verify → record release and rollback/forward-fix outcome.

## 12. Architecture decisions

Resolved 2026-10-29 (owner): agents see their team's queue plus tickets assigned to them; no `closed` status in V1; requester (with reason) and staff can reopen. See `docs/adr/0003-phase2-data-model-and-access.md` for the data model and the assumptions awaiting confirmation.

Still open:

- Must ticket creation work fully offline, or are local drafts enough?
- Which notification channels/provider?
- Retention/deletion policy?
- Which host and free-tier constraints apply at deployment time?

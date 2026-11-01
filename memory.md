# Blaze — Project Memory and AI Session Handoff

Update this file when a decision is finalized or implementation status changes. Never invent progress.

## Product

Blaze is a ticketing system: requesters create tickets by category; agents acknowledge, assign/reassign, investigate, resolve and reopen; supervisors oversee queues; admins manage roles and configuration.

## Confirmed decisions

- Project: Blaze; starting from scratch; solo owner will vibe-code with AI assistance.
- Requester mobile app: React Native + Expo; Android is first test target.
- Mobile navigation: Expo Router.
- Mobile state: Zustand for transient UI state.
- Local persistence: SQLite for drafts/cache/optional safe outbox; PostgreSQL is the authoritative system of record.
- Agent/admin portal: React + TypeScript web app.
- Backend: Supabase + PostgreSQL/Auth, with RLS and trusted server-side logic.
- UI: dark indigo identity, Plus Jakarta Sans, semantic tokens.
- Source/CI: private GitHub repository and GitHub Actions.
- Cost: prefer free tiers/local tools; free tiers are not assumed to have production SLAs.
- Required environments: DEV, UAT, staging, production.
- Security: least privilege, RLS, audit trail, no service-role key in clients, synthetic non-prod data.

## Setup documentation

- `setup.md` is the living install/run guide (prerequisites, installs, env files, commands, troubleshooting). `docs/supabase-setup.md` covers connecting to Supabase. Keep both current.

## Developer environment

- Windows.
- Node.js and Git are reported installed; exact versions not verified.
- Android phone is the initial test device.

## Current status (as of 2026-10-28)

- [x] `prd.md`, `design.md`, `phases.md`, `architecture.md`, `memory.md` drafted.
- **Phase 0 (Foundation): owner reports it is working on their machine (2026-10-28). Specific items not individually confirmed in chat: GitHub private repo, CI run on a PR, Expo Go on Android. Treat as working but ask before assuming CI is green.**
  - [x] Documents reviewed.
  - [x] Repo scaffold created: `apps/web` (Vite React TS), `apps/mobile` (Expo blank TS, strict), `packages/shared`, `supabase/` (empty), `docs/adr/`.
  - [x] Prettier, `.editorconfig`, oxlint (web), strict TS, `.gitignore`, `.env.example`, README, ADR 0001, GitHub Actions `ci.yml` written.
  - [x] In sandbox (Linux, Node 22): `npm run check` passed (format, shared typecheck, web lint, web build, mobile typecheck).
  - [ ] NOT done: private GitHub repo not created; CI never run on GitHub; Node/npm/Git versions on owner's Windows machine not verified; mobile app not run in Expo Go; web dev server not run on owner's machine; `expo-doctor` could not complete (sandbox has no access to Expo servers).
  - Scaffold versions as generated: Expo ~58, React Native 0.88, TypeScript ~6 (mobile) / ~7 (web). Not yet verified against Expo Go on the owner's phone.
- **Phase 1 (UX shell/design system): PARTIAL - built and checked in the AI sandbox only; owner review on device/browser pending. Phase 0 owner-side verification is also still pending, so Phase 1 is provisional.**
  - [x] Expo Router configured (`expo-router/entry`, typed routes on): `(auth)/sign-in`, `(tabs)/home`, `(tabs)/tickets`, `tickets/new`, `tickets/[id]`, `profile`. Android Metro bundle compiled in sandbox.
  - [x] Central tokens (`src/theme/tokens.ts` in each app; duplicated on purpose, see ADR 0002) and Plus Jakarta Sans (mobile: `@expo-google-fonts/plus-jakarta-sans` with fallback if load fails; web: `@fontsource`, system fallback in CSS).
  - [x] Mobile components: AppButton, AppTextField, StatusBadge, PriorityBadge, TicketCard, Loading/Empty/Error states, ScreenHeader, Screen.
  - [x] Web shell (React Router): sidebar + responsive Menu button, skip link, Overview, Ticket queue table (scrolls horizontally on narrow screens), ticket detail, Categories, Users and roles, Settings placeholders; badges and states.
  - [x] Tests passing in sandbox: mobile 23 (components + WCAG AA contrast of token pairs), web 21 (navigation, a11y basics, contrast). `npm run check` exits 0 (now includes both test suites).
  - Screens use PLACEHOLDER sample data only (`sampleData.ts`); the sign-in "Continue (preview)" button is NOT authentication; the new-ticket form only validates locally and sends nothing.
  - [ ] NOT done / not verified: running on a real Android device in Expo Go; viewing the web UI in a real browser; owner review of layouts and UI states (Phase 1 exit criterion); screen-reader testing; CI on GitHub.
  - [ ] Design components not yet built: ConfirmDialog, Avatar, TimelineItem, FilterChips, OfflineBanner, category picker as a reusable component, toast feedback (new-ticket category chips are inline for now). Mobile has no linter yet.
  - Version notes: mobile pins `react-dom` and `react-test-renderer` to 19.3.0 to match `react` (npm peer conflicts otherwise); `@testing-library/react-native` v14 `render`/`fireEvent` are async.
- **Phase 2 (Data model/security): PARTIAL - designed, implemented and tested on plain PostgreSQL (PGlite) in the AI sandbox only; NOT yet run on real Supabase and not reviewed by the owner.**
  - Owner decisions (2026-10-29): agents see their team's queue plus tickets assigned to them; no `closed` status in V1; requester (with reason) and staff can reopen resolved tickets.
  - [x] Migrations in `supabase/migrations/` (3 files): enums, tables (profiles, teams, team_members, ticket_categories, tickets, ticket_comments, ticket_events, admin_audit_events), indexes, constraints, `BLZ-######` reference sequence, version column (optimistic concurrency), `client_request_id` (idempotency), append-only triggers, profile-on-signup trigger (always `requester`).
  - [x] RLS on every table, SELECT-only for `authenticated`, nothing for `anon`; all writes through SECURITY DEFINER RPCs (create_ticket, acknowledge_ticket, start_work, resolve_ticket, reopen_ticket, assign_ticket, add_comment, update_own_profile, admin_set_user_role, admin_set_user_active, admin_upsert_category, admin_set_team_member). Helpers live in the unexposed `private` schema.
  - [x] `supabase/seed.sql` (synthetic users/teams/categories; users cannot sign in).
  - [x] 36 DB tests in `tests/db/` (run via `npm run db:test`, included in `npm run check`): clean setup, role escalation blocked, direct writes denied, anon denied, visibility by role/team, internal notes hidden, lifecycle + invalid transitions, stale versions, assignment rules, append-only audit, admin-only flows. Tests found and fixed a NULL-handling bug in the scope check before delivery.
  - [x] ADR `docs/adr/0003-phase2-data-model-and-access.md` lists design plus assumptions A1-A9 that the owner has NOT confirmed (e.g. admins see all tickets, comments append-only, supervisors team-scoped).
  - [ ] NOT done / not verified: `supabase db reset` on the real local Supabase stack (needs Docker Desktop/WSL2); no Supabase project created or linked; seed inserting only `id,email` into real `auth.users` unverified; generated TypeScript DB types; concurrency tested only sequentially (no true parallel transactions); performance/index review; retention/deletion policy; notifications; attachments.
  - Open decisions remaining: offline ticket creation vs drafts only, notification provider, retention/deletion, hosting.
- **Phase 3 (Authentication): PARTIAL - code written and tested with FAKE auth clients in the AI sandbox only. Not tested against a real Supabase project, a real device or a real browser session.**
  - [x] Mobile: `@supabase/supabase-js` + chunked SecureStore session storage, `AuthProvider` (loading/signedOut/signedIn/unconfigured), real sign-in screen, Profile with sign-out, route protection via `Stack.Protected`, foreground-only token refresh, safe error messages, deactivated-account sign-out.
  - [x] Web: `AuthProvider`, `/login`, `RequireAuth` / `RequireStaff` (requesters see "Staff access only") / `RequireRole` (admin pages), sidebar sign-out, session restore.
  - [x] Env: `apps/mobile/.env.example`, `apps/web/.env.example` (publishable key only; no service-role key anywhere).
  - [x] Tests: mobile 48, web 38 (signed-out access blocked on every private route, requester/agent/admin gating, safe errors, session restore, sign-out, deactivated users); DB tests 36 unchanged. `npm run check` exits 0 in the sandbox. Android Metro bundle compiled.
  - [x] Docs: `docs/supabase-setup.md` (owner steps + verification checklist), ADR `docs/adr/0004-authentication.md` (assumptions B1-B5 unconfirmed).
  - [ ] NOT done / not verified: no Supabase DEV project created or linked; migrations not pushed to a real project; real sign-in, session restore after app restart, and token refresh unverified; `expo start`/Expo Go not run; no password reset/change, no self-registration, no MFA; role-cannot-be-self-assigned verified at DB level (Phase 2 tests) but not end-to-end through real Auth; generated DB types not created.
- **Phase 4 (Requester tickets, mobile): PARTIAL - built and tested with fakes/in-memory stand-ins in the AI sandbox only; not run against real Supabase, a device or a real SQLite.**
  - [x] Migration `20261029000005` (was briefly named `...000004`; renamed 2026-10-30 because another migration already used that version): `create_ticket` returns the original ticket for same key + same content and raises `idempotency_conflict` for same key + different content. +4 DB tests (40 total).
  - [x] Mobile: real ticket list (Home + My tickets, pull to refresh, refresh on focus), New ticket form (category and priority pickers, validation mirroring server limits), ticket detail with status/priority, description, resolution and public timeline, success message with reference and status.
  - [x] Local drafts in SQLite (one per user), Zustand draft store, key saved before sending and reused for retries, double-tap blocked, conflict handling, sign-out wipes drafts (`DraftSync` in root layout), explicit labels: local draft / sending / not confirmed.
  - [x] Typed repository results + safe error messages; states: loading, empty, error/retry, not found, offline/not-confirmed, success.
  - [x] Tests: mobile 81 (store, repository, timeline, validation, new-ticket screen incl. duplicate-send and retry-with-same-key), DB 40, web 38. `npm run check` exits 0 in sandbox; Android bundle compiled.
  - [x] Docs: ADR `docs/adr/0005-requester-tickets.md` (assumptions C1-C6 unconfirmed), Phase 4 checklist in `docs/supabase-setup.md`, `setup.md` updated (new packages: zustand, expo-sqlite, expo-crypto).
  - [x] Added 2026-10-31: requester **reply box** and **Reopen this ticket** (reason required, version-checked) on the mobile ticket screen; 30-second quiet auto-refresh while open (foreground only); resend protection after unknown-outcome failures (ADR 0005 update). Mobile tests now 120.
  - [ ] NOT done / not verified: real device run (SQLite, expo-crypto), real network failure behaviour, push of migrations 4-5 to a hosted project, attachments (deferred until private-storage policies are tested), requester reply/reopen UI, pagination/search, offline outbox.
- **Phase 5 (Agent/admin workflows, web portal): PARTIAL - built and tested with a fake repository and in-memory database in the AI sandbox only; not run against real Supabase or in a real browser.**
  - Provenance: the web UI files (queue, ticket detail and dialogs, admin pages, filters, `Dialog`) and migration `20261029000004_assignment_events_staff_only.sql` + `tests/db/staff.test.ts` were written in a separate earlier working session and were not recorded here at the time. In this session `staffRepository` (which the UI imports) was rewritten to the UI's contract, the UI was kept, and tests/docs were added. Some small supporting files were overwritten by mistake during that and rebuilt (`utils/time.ts`, `hooks/useLoad.ts`, `Notice`, `repositories/result.ts`).
  - [x] Migration `20261029000004_assignment_events_staff_only.sql`: assignment/reassignment events (and their reason) are staff-only; requesters see only lifecycle events. (Not an owner decision yet: see ADR 0006 D1.)
  - [x] Queue (filters: status, assignment, priority, search; latest 200 tickets, client-side filtering), ticket detail with staff history (names, "Staff only" markers), acknowledge / start work / resolve (summary required) / reopen (reason required) / assign-reassign (eligible agents only), public replies vs internal notes, one action at a time, stale-version and invalid-transition handling with automatic refresh, no success shown before the server confirms.
  - [x] Admin (admin role only in the UI; enforced by the database): Users and roles (confirm dialogs, cannot change own role/status, team membership), Categories (create/edit/deactivate, default team), Audit log (latest 100), Overview counts.
  - [x] Tests: web 135 (repository, queue, ticket actions, dialogs, assignment, replies/notes, admin pages, logic, guards), DB 45, mobile 81. `npm run check` exits 0 in sandbox.
  - [x] Docs: ADR `docs/adr/0006-staff-workflows.md` (assumptions D1-D8 unconfirmed), Phase 5 checklist in `docs/supabase-setup.md`, `setup.md` changelog.
  - [ ] NOT done / not verified: real Supabase run (the repository queries, RPC calls and RLS-filtered reads are unverified against PostgREST); real browser; pagination/server-side search; admin UI to create teams; Settings/profile page is still a placeholder (display-name edit via `update_own_profile` not wired); emails are not shown in the Users list (names default to the email prefix); requester reopen/reply UI on mobile; notifications; attachments.
- **Phase 6 (Reliability/operations): PARTIAL - built and tested in the AI sandbox (in-memory PostgreSQL, fakes); nothing run on real Supabase, a real provider or a real restore.**
  - [x] Migration `20261030000001_ops_outbox_and_rate_limits.sql`: transactional `notification_outbox` (ids + kind only, service-role worker API: claim/complete/fail with backoff, dead-letter after 5 attempts, stale-claim reclaim), `rate_limits` table + enforcement in `create_ticket` (20/hour) and `add_comment` (60/10 min), idempotent retries exempt.
  - [x] `packages/shared/src/notifications.ts`: provider-agnostic dispatcher, generic templates, safe error codes (no provider chosen, no worker deployed).
  - [x] Structured redacted logging + repository instrumentation in web and mobile; `rate_limited` error kind and message; sign-in failures logged without the email.
  - [x] Tests: DB/unit 81 (notifications, worker, rate limits, atomic failure, hostile input, migration hygiene, load check on 3,000 tickets), web 150, mobile 97. `npm run check` exits 0 in sandbox.
  - [x] Docs: `docs/operations.md` (runbook), ADR `docs/adr/0007-operations-and-reliability.md` (assumptions E1-E9 unconfirmed), setup.md and supabase-setup.md updated.
  - [ ] NOT done / not verified: SLA timers and escalation (needs a policy, see ADR 0007 E4), notification worker and provider, central log service/alerts, a real backup/restore drill, retention purge jobs, anonymize/erasure procedure, Supabase Auth rate-limit review, real parallel load.
- **Phase 7 (CI/CD and environments): PARTIAL - built and validated locally (actionlint, unit tests, in-memory database, real Expo config loader); nothing has run on GitHub, Cloudflare, Supabase or EAS.**
  - Research (2026-10, third-party + vendor pages; owner should re-check): GitHub Free private repos cannot use required status checks, branch rulesets or environment approvals (need Pro/Team or a public repo); Supabase Free = 2 active projects, no backups, pauses after ~7 idle days; Cloudflare Pages Free = unlimited bandwidth, 500 builds/month, commercial use OK; Vercel Hobby is non-commercial; EAS Free ~15 Android builds/month (older sources 30).
  - [x] `ci.yml`: Checks (`npm run check`, now incl. `security:scan`), Dependency audit (root/shared/web block on high/critical; mobile report-only: 30 findings, 2 high in `@expo/cli` and `zod`), Supabase local stack (real `db reset`, `supabase test db`, anonymous-access smoke on the real API).
  - [x] `deploy.yml`: manual per environment (dev/uat/staging/production); gate = CI green for the exact commit + release tag + release record read from the default branch + typed production confirmation; optional `db push` after a dry run; build per environment; Cloudflare Pages direct upload; read-only smoke. Config via prefixed repo variables/secrets (`DEV_/UAT_/STAGING_/PROD_`).
  - [x] Scripts with tests: `scan-secrets.mjs` (also guards the repo itself), `check-release-record.mjs`, `smoke.mjs`. `supabase/config.toml` from the real CLI (sign-up off), pgTAP file `supabase/tests/database/01_security_smoke.test.sql` (15 expectations; verified in memory with a stand-in for pgTAP).
  - [x] Environment awareness: web `VITE_APP_ENV` and mobile `APP_ENV` banners; mobile `app.config.ts` (4 variants, production refuses placeholder package id `com.example.blaze`; verified with the real Expo CLI) and `eas.json`; web `_headers` (CSP etc.) and `_redirects`; Dependabot (Expo/RN ignored).
  - [x] Tests: root 110, web 153, mobile 131; `npm run check` exits 0 in sandbox; both workflows pass `actionlint`.
  - [x] Docs: `docs/environments.md`, `docs/release-runbook.md`, `docs/mobile-distribution.md`, `docs/releases/TEMPLATE.md`, ADR `docs/adr/0008-cicd-and-environments.md` (assumptions F1-F10 unconfirmed), setup.md and supabase-setup.md (section 10) updated.
  - Corrected: `supabase db push` has no `--yes` flag (CLI 2.122); `db dump` uses `--linked`.
  - [ ] NOT done / not verified: any GitHub Actions run (esp. the real-stack job and the db push / wrangler steps), Cloudflare and EAS account setup, headers/CSP in a real browser, a real Android build, a real UAT/staging/production deployment, and enforcement of branch/environment protections (blocked by the GitHub plan question).
- Phases 8-10: not started.
- Supabase project not confirmed created/connected. Real ticket schema, auth, RLS and lifecycle workflows not implemented/verified.
- No UAT, staging or production deployment. Do not call Blaze live or production-ready.

## Constraints

- Pricing/quotas/free-tier limits can change; check current official terms.
- Expo Go is for development, not the final production distribution artifact.
- Client-supplied roles and hidden UI controls do not provide security.
- SQLite may be stale/lost; pending local actions are not server-confirmed.
- Avoid four paid cloud environments at the start; preserve release gates while using local/temporary staging where necessary.
- Never ask the owner to paste secrets into chat or commit them.
- No destructive migration or production operation without explicit approval and recovery plan.

## Instructions for future AI coding sessions

1. Read this file and relevant sections of `prd.md`, `design.md`, `phases.md`, and `architecture.md`.
2. Flag conflicts rather than silently guessing.
3. Implement one small vertical slice at a time.
4. For substantial work, state files to change and acceptance criteria first.
5. Preserve the selected stack; explain any proposed framework change.
6. Verify current official compatibility guidance before Expo/native dependency upgrades.
7. Never claim tests/deployments succeeded unless actually run and checked.
8. Enforce authorization in trusted server/database logic; test denied access.
9. Add new migrations; don't rewrite applied migrations.
10. Update this file with actual status: completed, partial, blocked or not started.
11. Give Windows PowerShell commands and explain expected outputs.
12. Ask before irreversible/security-sensitive decisions.
13. Whenever you add/remove a dependency, tool, env variable, script or setup step, update `setup.md` (relevant section, "Last updated" and the setup changelog) in the same change, and note it in the change log here.
14. Whenever you add or change a tool, dependency, npm script, environment variable, folder/app, external service or setup workaround, update `setup.md` (relevant table + its change log) in the same change, and the matching `.env.example` when env vars change.

## Next action

1. Owner decisions (ADR 0003-0008 assumptions; priority list): SLA policy or "out of V1" (ADR 0007 E4); notification provider and recipients (E1, E5); retention/deletion (E6); Supabase plan for production and the UAT/staging approach (ADR 0008 F2); **GitHub plan** (upgrade vs procedural gates, F3); web host confirmation (F1); real Android package id (F6).
2. Owner: connect the real stack: follow `docs/supabase-setup.md` sections 1-10 (DEV/UAT project, `db push` of 6 migrations, test users, `.env` files), push to GitHub and read the first CI results; report failures (the real-stack job has never run).
3. Owner: review the Phase 1 UI, mobile flows and staff portal in a browser and on a phone.
4. After owner confirmation, mark Phase 0-7 exit criteria complete; then Phase 8 (UAT and release candidate: write and run the recorded UAT scenarios from `phases.md`, fix defects, produce the release candidate and its release record).

## Change log

- 2026-10-28: Initial project docs created. V1 baseline is proposed; unresolved policy choices are listed in `architecture.md` and `prd.md`.
- 2026-10-28: Phase 0 scaffold generated and checked in sandbox; owner-side verification and GitHub/CI pending.
- 2026-10-28: Phase 1 UX shell built for mobile and web; sandbox checks pass; owner verification and review pending.
- 2026-10-28: Owner reported Phase 0 working on their machine. Phase 1 review by owner still pending.
- 2026-10-29: Owner reported Phase 0 working. Phase 1 review still pending. Owner asked for a learning-topics list (provided in chat).
- 2026-10-29: Owner answered Phase 2 policy questions. Phase 2 schema, RLS, RPCs, seed and 36 DB tests built; sandbox checks pass (`npm run check` exit 0); real-Supabase verification and owner confirmation of assumptions pending.
- 2026-10-29: Added `setup.md` (full setup, dependency inventory, troubleshooting, rule to keep it updated). Rule 13 added to future-session instructions.
- 2026-10-29: Phase 3 authentication built for mobile and web with fake-client tests; sandbox checks pass; real-Supabase verification and owner confirmation pending.
- 2026-10-29: Added `setup.md` (living setup guide) and instruction 13 requiring it to be updated with any setup change.
- 2026-10-30: Phase 4 requester tickets built (mobile) with migration 4; sandbox checks pass; real-stack verification and owner confirmation pending. `setup.md` updated.
- 2026-10-30: Phase 5 staff workflows completed (repository, tests, docs) on top of UI written in an earlier unrecorded session; duplicate migration version `000004` resolved by renaming the idempotency migration to `000005`; sandbox checks pass; real-stack verification and owner confirmation pending. `setup.md` updated.
- 2026-10-30: Phase 6 reliability/operations built (outbox, rate limits, logging, dispatcher, runbook, tests); sandbox checks pass; real-stack verification and owner decisions (SLA, provider, retention, backups) pending. `setup.md` updated.
- 2026-10-31: Mobile requester reply + reopen + auto-refresh added (Phase 4 follow-up) with tests; docs (ADR 0005 update, supabase-setup checklist, operations) updated; no new dependencies.
- 2026-10-31: Phase 7 CI/CD and environments built (workflows validated with actionlint, scripts and pgTAP file tested locally, app variants, docs); real pipeline runs and owner decisions (plan/host/package id) pending. `setup.md` updated.

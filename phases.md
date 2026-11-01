# Blaze — Development Roadmap

Status: proposed. Work in small vertical slices; do not advance while exit criteria fail.

## Operating rules

- Keep `main` releasable; use small branches and reviewed PRs.
- Every feature includes tests, authorization, UI states and docs as applicable.
- Schema changes are versioned migrations.
- Never commit secrets or production data.
- Never claim production-ready without verified release gates and recovery plan.

## Phase 0 — Foundation

Tasks:

- [ ] Review all five project documents.
- [ ] Create private Git repository and default branch.
- [ ] Verify Node LTS, npm, Git, Expo Go, local tools.
- [ ] Set up formatting, linting, strict TypeScript and CI.
- [ ] Add README, `.gitignore`, env examples and ADRs.
- [ ] Confirm mobile shell runs in Expo Go and web shell builds.
      Exit: both apps start locally; CI passes on PR; clean setup is documented; no secrets committed.

## Phase 1 — UX shell/design system

- [ ] Configure Expo Router and typed route layout.
- [ ] Add centralized tokens and Plus Jakarta Sans.
- [ ] Build buttons, fields, badges, cards, loading/empty/error states.
- [ ] Create mobile placeholder screens and web navigation shell.
- [ ] Add basic component tests and accessibility checks.
      Exit: navigation works without backend data; responsive layouts and UI states are reviewed.

## Phase 2 — Data model/security

- [ ] Finalize roles, lifecycle, categories, priorities, visibility and queue scope.
- [ ] Design profiles, tickets, categories, comments, assignment/history/audit schema.
- [ ] Add constraints, indexes, timestamps, reference generation and concurrency approach.
- [ ] Design RLS and trusted role-management mechanism.
- [ ] Add migrations, synthetic seed data and negative authorization tests.
      Exit: clean database setup works; RLS denies unauthorized access; role escalation is blocked; internal notes are private.

## Phase 3 — Authentication

- [ ] Configure Supabase Auth for non-production.
- [ ] Implement sign-in/out, session restore and safe errors.
- [ ] Default new users to requester.
- [ ] Protect mobile/web routes and test session boundaries.
      Exit: signed-out access blocked; role cannot be self-assigned; session restore works.

## Phase 4 — Requester tickets

- [ ] Create ticket form/category picker.
- [ ] Ticket list/detail and public timeline.
- [ ] Server validation and safe retry/idempotency strategy.
- [ ] Loading/empty/error/offline/success states.
- [ ] Test ownership and duplicate submissions.
- [ ] Add attachments only after private-storage policies are tested.
      Exit: requesters can create and track only authorized tickets; local draft is not confused with submission.

## Phase 5 — Agent/admin workflows

- [ ] Agent queue and ticket detail.
- [ ] Acknowledge and move to in progress.
- [ ] Assign/reassign to eligible agents.
- [ ] Public replies versus internal notes.
- [ ] Resolve with summary; reopen with reason.
- [ ] Admin category and controlled role management.
- [ ] Audit history and concurrent-update handling.
- [ ] Tests for allowed and denied transitions.
      Exit: every action is permission-checked and audited; requester cannot access staff-only data.

## Phase 6 — Reliability/operations

- [ ] Notification abstraction; select provider later.
- [ ] Add SLA timers/escalation if still in scope.
- [ ] Structured logs without secrets/needless PII.
- [ ] Rate limits/abuse protection where supported.
- [ ] Document backup, restore, retention and deletion.
- [ ] Test migrations and basic load/failure cases.
      Exit: failures are actionable; recovery steps are documented and tested where feasible.

## Phase 7 — CI/CD and environments

- [ ] CI: install, lint, typecheck, tests, build, dependency audit.
- [ ] Validate Supabase migrations in CI/local workflow.
- [ ] Define DEV/UAT/staging/PROD configuration.
- [ ] Store secrets in platform secret stores, not source.
- [ ] Deploy web app to selected free host.
- [ ] Document mobile build/distribution.
- [ ] Require UAT approval before staging promotion.
- [ ] Require explicit production approval.
- [ ] Add post-deploy smoke checks and rollback/forward-fix runbook.
      Exit: PR checks are required; environments are isolated; releases are reproducible and verified.

## Phase 8 — UAT/release candidate

Run and record:

- [ ] Sign in and create valid ticket.
- [ ] Invalid required fields rejected.
- [ ] Requester cannot read another user's ticket.
- [ ] Agent acknowledges and starts work.
- [ ] Authorized assignment/reassignment works.
- [ ] Internal notes hidden from requester.
- [ ] Resolve requires summary; reopen requires authorization/reason.
- [ ] Invalid transitions rejected.
- [ ] Concurrent changes do not silently overwrite.
- [ ] Mobile handles slow network and retry.
- [ ] Web works at desktop and narrow viewport.
      Exit: results recorded; no unresolved critical/high security defects; owner approves; staging smoke/recovery checks pass.

## Phase 9 — Production launch

- [ ] Confirm production project, URL/domain, credentials, access and quotas.
- [ ] Verify backup/recovery settings and restore test where available.
- [ ] Apply reviewed migrations.
- [ ] Deploy approved release and run safe smoke tests.
- [ ] Verify auth, ticket creation, assignment, resolution, logs and alerts.
- [ ] Monitor launch and record incidents.
- [ ] Document release and rollback/forward-fix outcome.
      Exit: checks pass, no unexpected data exposure, recovery owner is clear, release record complete.

## Phase 10 — Continuous improvement

Review incidents, escaped defects, delivery metrics, dependencies, cost limits and P1 priorities. Add features only while core reliability remains sound.

## Dependencies

Phase 0 → 1 → 2 → 3 → 4 → 5 → 6/7 → 8 → 9 → 10. Phases 6 and 7 can overlap after core schema/tests stabilize; production cannot precede release gates.

## Definition of done

- [ ] Acceptance criteria clear.
- [ ] Implementation matches architecture/design.
- [ ] Trusted-layer authorization exists.
- [ ] Relevant tests pass.
- [ ] Error/empty/loading/offline states considered.
- [ ] No secret/PII leak.
- [ ] Docs and `memory.md` updated when needed.
- [ ] Diff is reviewable and reversible.

# Blaze - Operations Runbook

Status: **draft for the pre-production phases.** Nothing here has been exercised against a real Supabase project yet. Items marked **PROPOSED** are suggestions that need the owner's decision (see ADR 0007). Plan features and prices change: **re-check the official Supabase pricing and docs** before relying on anything about plans or backups.

## 1. Where to look when something is wrong

| What                                 | Where                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Database, API and Auth logs          | Supabase dashboard -> Logs (retention depends on the plan)                                                       |
| Failed or slow app calls             | App logs: one JSON line per event (see below). Mobile: the Expo terminal / device log. Web: the browser console. |
| Who changed a ticket                 | `ticket_events` (every transition, assignment, reply)                                                            |
| Who changed roles, categories, teams | `admin_audit_events` (also the Audit log page in the portal)                                                     |
| Undelivered notifications            | `notification_outbox` (section 4)                                                                                |

**App log events** (all JSON, redacted by `src/lib/logger.ts`):

| Event                      | Level               | Meaning                                                                                                                                | Useful fields                                                         |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `repo_failed`              | info / warn / error | a data call failed. `info` = expected outcome (validation, stale, not found), `warn` = network or not configured, `error` = unexpected | `op`, `kind`, `durationMs`, `clientRequestId` (ticket creation), `id` |
| `auth_sign_in_failed`      | warn                | sign-in rejected                                                                                                                       | `code`, `status` (never the email)                                    |
| `auth_deactivated_signout` | info                | a deactivated account was signed out                                                                                                   | -                                                                     |
| `draft_persist_failed`     | warn                | the local draft could not be saved on the phone                                                                                        | `errorType`                                                           |

Rules: log codes, kinds, ids and durations; **never** passwords, tokens, emails, ticket titles/descriptions/notes or names. The logger redacts risky keys and patterns as a safety net, but do not rely on it.

**Tracing a "my ticket was created twice / never arrived" report:** ask for the time; find `repo_failed` with `op: createTicket` and its `clientRequestId`; then `select id, reference, created_at from tickets where client_request_id = '<id>'`. One row means no duplicate (retries with the same key return the same ticket).

**Not built yet (open decision):** a central log service, uptime checks and alerting. Until then, logs only exist on the device/browser and in Supabase's own logs.

## 2. Rate limits and abuse protection

Database-enforced, per user, rolling window. Values live in `public.rate_limits` (PROPOSED defaults):

| Action          | Limit | Window     |
| --------------- | ----- | ---------- |
| `create_ticket` | 20    | 1 hour     |
| `add_comment`   | 60    | 10 minutes |

- A retry of a ticket that already exists is never blocked (the duplicate check runs first).
- Users see "You're doing that too often. Please wait a few minutes and try again." (error code `54000`).
- Change a limit (project owner, SQL editor): `update public.rate_limits set max_count = 40 where action = 'create_ticket';`. API users cannot read or change this table.
- **Not covered by these limits:** sign-in attempts and sign-ups. Those are controlled by Supabase Auth settings (Authentication -> Rate limits / Attack protection in the dashboard). Review them before UAT. Self-registration is off in the apps (ADR 0004 B1); keep "Allow new users to sign up" off unless that changes.
- Staff actions other than comments (acknowledge, assign, ...) are not rate limited; they require a staff account and a matching ticket version.

## 3. Failure behaviour (what is guaranteed)

- A ticket state change and its audit event commit **together or not at all** (tested by forcing the audit insert to fail).
- Invalid, malformed, oversized or hostile input returns typed errors (`invalid_input`, `stale_version`, `forbidden`, ...), never partial writes; injection-looking text is stored as plain data (tested).
- Stale edits fail with `stale_version`; the portal refreshes and warns. Duplicate sends return the original ticket.
- Rejected requests leave no locks or half-applied changes (tested).
- A network failure while creating a ticket leaves the local draft and its key; retrying cannot duplicate.
- A reply whose send fails with an unknown outcome is checked against the refreshed timeline before the app lets the user resend. Replies have no server-side idempotency key, so a duplicate is still possible if that refresh also fails (low risk, see ADR 0005 update).

## 4. Notifications (outbox)

Flow: a ticket event is written -> the same transaction adds `notification_outbox` rows (who should hear about it and why) -> a worker claims rows, sends them through a channel (email/push, **provider not chosen**), and marks them sent or failed.

**Current state: no worker and no provider exist.** Rows are created and stay `pending`; nothing is sent. This is intentional (decision pending) but means the table grows. It stores only ids and kinds (no personal text), so growth is small, but plan the worker before launch.

Kinds: `ticket_acknowledged`, `ticket_resolved`, `ticket_reopened`, `staff_reply` (to the requester); `assigned_to_you`, `requester_reply`, `requester_reopened` (to the assignee). Nobody is notified about their own actions, internal notes, or ticket creation.

Status life cycle: `pending` -> `processing` (claimed) -> `sent`, or `failed` (retry with 2, 4, 8... minute backoff) -> `dead` after 5 attempts. Rows stuck in `processing` for 10 minutes (worker crash) are reclaimed automatically.

Health queries (SQL editor):

```sql
select status, count(*) from public.notification_outbox group by status;
select id, kind, attempts, last_error, created_at from public.notification_outbox where status = 'dead' order by id desc limit 50;  -- needs a human
select min(created_at) as oldest_pending from public.notification_outbox where status in ('pending','failed');
```

Dead rows: read `last_error` (a short code, never message text), fix the cause (provider credentials, address data), then re-queue: `update public.notification_outbox set status='pending', attempts=0, next_attempt_at=now() where id = <id>;`

The delivery code that exists today is `packages/shared/src/notifications.ts` (dispatcher, templates, safe error codes). Wiring it to a real provider is a later task: a small worker (for example a Supabase Edge Function on a schedule) with the service-role key stored only in that platform's secret store.

## 5. Backups and restore

**Facts to verify on supabase.com/pricing before launch** (from third-party summaries and the pricing page at the time of writing): the Free plan has **no automatic backups**; paid plans keep daily backups for a limited number of days (about 7 on Pro); point-in-time recovery is a paid add-on; Free projects are **paused after about a week of inactivity**. Consequences: do not put real data on a Free project without your own backups, and do not expect a Free project to stay up when idle (this matters for UAT and staging).

**Your own logical backup (works on any plan).** Requires the Supabase CLI and, for `db dump`, Docker Desktop. Flags confirmed against Supabase CLI 2.122 (`--linked`, `--data-only`, `--role-only`, `--file/-f`; re-check with `npx supabase db dump --help`):

```powershell
cd C:\dev\blaze
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db dump --linked -f backups\schema.sql
npx supabase db dump --linked --data-only -f backups\data.sql
npx supabase db dump --linked --role-only -f backups\roles.sql
```

Store backups **outside the repository** (they contain real data; `.gitignore` already excludes common secret files but not a `backups` folder: keep it outside or add it). Encrypt before copying to cloud storage. Confirm the dump covers what you need: tickets and profiles live in `public`; sign-in accounts live in the `auth` schema, which a default dump may not include. **A restore is only proven once you have done the drill below.**

**Restore drill (do this before production; repeat after major changes).**

1. Create a throwaway Supabase project (or `npx supabase start` locally) named `blaze-restore-test`. Never restore over production as a test.
2. Apply the migrations or the schema dump, then load `data.sql`.
3. Check: row counts of `tickets`, `ticket_events`, `ticket_comments`, `profiles` match the source; sign in as a test user; open a ticket; run a denied-access check (a requester cannot see another's ticket); run `npm run db:test` against the schema (it rebuilds from the migration files).
4. Record the date, dump size, how long each step took, and anything that failed. Those numbers become your real RTO.
5. Delete the throwaway project.

**Targets (PROPOSED, not decided):** RPO (data you can afford to lose) <= 24 hours, which needs paid daily backups or your own daily dump; RTO (time to be back) <= 4 hours.

**Rolling back a bad release.** Migrations are forward-only. Fix with a new migration or revert the app deploy. Before applying a risky migration to a real project, take a dump first. Destructive statements (`drop table/column/schema`, `truncate`) are blocked in migrations by an automated test and need explicit owner approval plus a recovery plan.

**What has been tested:** the whole database rebuilds from the migration files from scratch (every test run does this). **Not tested:** a real backup/restore on Supabase (not possible from the development sandbox).

## 6. Data retention and deletion (PROPOSED: needs a decision)

| Data                             | Today                     | Proposed                                                                                           |
| -------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Tickets, comments, ticket events | kept forever              | keep while the account is active, then a fixed period (for example 2 years) - owner/legal decision |
| Admin audit log                  | kept forever, append-only | keep at least 2 years                                                                              |
| `notification_outbox`            | kept forever              | purge `sent` rows after 30 days, `dead` rows after 90 days (needs a scheduled job)                 |
| Local drafts on phones           | removed on sign-out       | unchanged                                                                                          |
| App logs                         | console only              | decide with the log service; keep short (for example 30 days)                                      |
| Supabase platform logs           | per plan                  | per plan                                                                                           |

**Deleting a user:** the database blocks deleting a user who owns tickets (foreign keys), on purpose, so history is not silently lost. Current practice: **deactivate** (admin Users page). **Not built:** an "anonymize" operation (replace display name, keep ticket history) and an erasure-request procedure. If you handle personal data of people in regulated regions, decide this before launch and get qualified advice; this document is not legal advice.

## 7. Incident basics

1. **Stop the bleeding:** deactivate affected accounts (Users page) or turn off sign-ups in Supabase Auth; for abuse, lower the relevant `rate_limits` row.
2. **If a key may have leaked:** never paste it in chat; rotate it in the Supabase dashboard (API keys / JWT settings), update the platform secret stores and `.env` files, redeploy. The apps only hold the publishable key; the service-role key must exist only in the worker's secret store.
3. **Collect facts:** time, user (role), screen, `clientRequestId` or ticket reference, Supabase logs for that window.
4. **Fix forward** with a new migration or app release, then write a short note (what happened, impact, cause, fix, what prevents a repeat) and add it to `memory.md` and, if it changes a decision, an ADR.

## 8. Before production (feeds Phases 7-9)

- [ ] Paid plan or an automated own-backup schedule; restore drill done and recorded.
- [ ] Supabase Auth rate limits and attack protection reviewed; sign-ups off or deliberately on.
- [ ] Notification provider chosen, worker deployed with secrets in a secret store, dead-letter check scheduled.
- [ ] Log service or at least a documented place and routine for reviewing logs; basic alert (email) for downtime.
- [ ] Retention/deletion decisions made and the purge jobs (if any) built and tested.
- [ ] RPO/RTO agreed; incident contacts filled in below.

Incident contacts: _(fill in)_

Release, deployment and rollback procedures live in `docs/release-runbook.md`; environments and secrets in `docs/environments.md`.

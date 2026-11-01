# ADR 0007: Operations and reliability (Phase 6)

- Status: proposed (2026-10-30). Database behaviour is tested on an in-memory PostgreSQL; nothing has been run on real Supabase, with real providers, or under real load.

## Decisions made in code

- **Transactional outbox for notifications.** Ticket events enqueue rows in `notification_outbox` inside the same transaction. Rows hold ids and a kind only (a test pins the exact column list so personal text cannot creep in). Only the service role can claim, complete or fail rows; API users cannot read the table. Failures back off 2, 4, 8... minutes, become `dead` after 5 attempts, and crashed claims are reclaimed after 10 minutes.
- **Provider-agnostic dispatcher** in `packages/shared` (channel and store interfaces, generic message templates, safe error codes). No email/push provider is chosen and no worker is deployed.
- **Database-enforced rate limits** (`rate_limits` table) for ticket creation and comments; idempotent retries are exempt. The apps map `54000`/`rate_limited` to a friendly message and keep the draft (nothing was created, so the same key is reused).
- **Structured, redacted logging** in both apps (`src/lib/logger.ts`), plus repository instrumentation that logs the operation, error kind, duration and safe ids, never arguments.
- **Tests:** notifications and the worker API, rate limits, atomic failure, hostile input, migration hygiene (unique increasing versions, no destructive statements without approval), and a basic load check (3,000 tickets; queue and visibility queries run in about 0.2 s in-memory).
- `docs/operations.md` is the runbook (monitoring, notifications, backup/restore drill, retention, incidents).

## Assumptions / open decisions (owner to confirm)

- E1: Which people are notified for which event (the list in operations.md section 4). Ticket creation notifies nobody; "notify the team queue" needs a decision (who, how often, digest vs one per ticket).
- E2: Rate-limit defaults (20 tickets/hour, 60 comments/10 minutes) are proposals.
- E3: Logs stay on the device/browser (console) and in Supabase's own logs until a log service is chosen.
- E4: **SLA timers and escalation are not implemented.** They need a policy first: response and resolution targets per priority, business hours or 24x7, what "breach" triggers and who is escalated to. Tell me the policy (or that it is out of V1) and it becomes a small follow-up.
- E5: Notification provider/channels (email, push, both) and who operates the worker.
- E6: Retention periods and deletion/anonymization approach (operations.md section 6), including any legal requirements.
- E7: RPO <= 24 h and RTO <= 4 h are proposed targets.
- E8: The Free Supabase plan has no automatic backups and pauses idle projects. Recommendation: use a paid plan (or an own scheduled dump plus a documented restore drill) before UAT holds real data. This has a cost, so it is your call.
- E9: Because the outbox is transactional, a failure to enqueue would fail the ticket action itself. This favours never losing a notification over availability; the enqueue is a tiny insert, so the risk is low.

## Verification status

Not verified: real parallel load (the in-memory database is single-connection), real backup/restore, real provider delivery, Supabase Auth rate limits, log service integration. The load numbers are an order-of-magnitude check only.

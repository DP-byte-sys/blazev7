# ADR 0005: Requester tickets (Phase 4)

- Status: proposed (2026-10-30). Tested with fake clients and an in-memory database only; not yet verified on a real Supabase project, device or SQLite on Android.

## Decisions

- Ticket creation goes through the server function `create_ticket`; reads use RLS-filtered selects. The mobile repository returns typed results (`network`, `validation`, `forbidden`, `not_found`, `conflict`, `unconfigured`, `unknown`) and never shows raw server text.
- **Drafts, not an offline queue.** The in-progress ticket is a _local draft_ stored in SQLite (one per user). Sending needs a network connection. The UI always labels it "Local draft - saved on this device. Not sent yet." (Offline outbox sync stays a P1 item.)
- **Idempotency.** Each draft has a `client_request_id`. It is saved _before_ the request is sent and reused for every retry of the same ticket, so a double-tap, a timeout or an app restart can never create a duplicate. Migration `20261029000004` makes a reused key with different content fail with `idempotency_conflict` instead of silently returning the older ticket; on conflict the app keeps the text, rotates the key and asks the user to check My tickets.
- **Sign-out wipes local drafts** (and drafts are keyed by user id), so another person on the same phone cannot see them. Draft text is stored in an ordinary SQLite table (not encrypted); tokens remain in SecureStore only.
- Zustand holds only transient UI state (the draft and its send status); the server stays the source of truth.
- The timeline shows requester-visible events and public replies only (the database hides internal notes/events). Staff appear as "Support"; staff names are never exposed.

## Assumptions / open decisions (owner to confirm)

- C1: Drafts only, no offline queue (see above).
- C2: One draft per user at a time.
- C3: Requesters pick a priority when creating (same as A6).
- C4: "My tickets" shows the 100 most recently updated tickets; no search, filters or pagination yet.
- C5: The reopen reason and public replies are shown to the requester in the timeline.
- C6: Not in Phase 4: requester replies to a ticket, requester reopen button, attachments (P1, only after private-storage policies are tested), push notifications.

## Verification status

Not verified: SQLite code on a real Android device (`src/db/sqliteDrafts.ts` is covered only by typecheck and a successful bundle; the store logic is tested against an in-memory stand-in), real network failures, the real `create_ticket` call from the app.

## Later note (Phase 5)

Migration `20261029000004_assignment_events_staff_only` made assignment events staff-only, so the requester timeline never shows who handled a ticket or why. The mobile timeline code still has text for those event types, but the database never returns them to requesters.

## Update (requester replies and reopen, mobile)

C6 is partly resolved: the ticket screen now has a **reply box** and, for resolved tickets, a **Reopen this ticket** form.

- Replies are always public (the app cannot send internal notes; the database would reject them). The box says "Support will see this reply."
- Reopen needs a reason (up to 1,000 characters) and sends the ticket version the screen saw. A stale version or invalid status shows a message and refreshes the ticket.
- Replies have no idempotency key. After a failed send with an unknown outcome (network/unknown), the app reloads the timeline and, if the same text from the same user appears within 5 minutes, treats it as sent instead of asking the user to resend. Double-taps are blocked while a send is in flight. Remaining risk: if the refresh also fails, the user may resend and create a duplicate reply; a server-side key would remove this (candidate for a later migration).
- The open ticket screen quietly refreshes every 30 seconds while the app is in the foreground (no live connection). Failed background refreshes are ignored.
- Still not built: push notifications (the outbox rows exist; no provider), attachments, editing or deleting replies (comments are append-only, A3).

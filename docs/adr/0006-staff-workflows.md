# ADR 0006: Staff workflows on the web portal (Phase 5)

- Status: proposed (2026-10-30). Tested with a fake repository and an in-memory database; not yet verified on a real Supabase project or in a real browser.

## Decisions

- Staff actions (acknowledge, start work, resolve, reopen, assign/reassign, public reply, internal note) and all admin actions call server-side functions. The UI only decides which buttons to _show_ (`availableActions`); the database re-checks role, team scope, state, input and version.
- Every transition sends the ticket `version` the screen saw. A stale version or an invalid transition shows a warning, reloads the ticket and does not claim success. One action runs at a time (buttons are disabled while it is in flight) and success messages appear only after the server confirms.
- Dialogs (resolve, reopen, assign, role change, deactivate, category) keep what the user typed and show server errors inside the dialog.
- Internal notes and internal events are marked "Staff only" in the portal. The queue shows only what row-level security returns: the team's tickets plus tickets assigned to the user (admins see all).
- Admin pages are hidden from non-admins in the UI (hiding is not security); every admin action is an admin-only function that writes `admin_audit_events`. Admins cannot change their own role or status.
- Typed repository results (`network`, `validation`, `forbidden`, `not_found`, `stale`, `invalid_transition`, `unconfigured`, `unknown`); raw server messages are never shown, except our own validation text.

## Assumptions / open decisions (owner to confirm)

- D1: Assignment and reassignment events, and the note entered with them, are staff-only (requesters see the lifecycle but not who handled the ticket or why). This came from migration `20261029000004_assignment_events_staff_only`, not from an explicit owner decision.
- D2: The queue loads the latest 200 tickets and filters (status, assignment, priority, search) in the browser; there is no server-side search or pagination yet. The audit log shows the latest 100 entries.
- D3: Any in-scope staff member (not only the assignee) can acknowledge, start, resolve, reopen and assign (same as A5).
- D4: Teams are not created in the UI; the Users page only toggles membership of existing teams (same as A7).
- D5: The Settings/profile page is still a placeholder (display-name editing is not wired up).
- D6: The Users list shows display names only, not emails. Names default to the email prefix, so two people can look alike until an admin-visible email or rename flow exists.
- D7: The resolution summary is shown to the requester (the dialog says so).
- D8: The reopen reason is shown to the requester in their timeline.

## Verification status

Not verified: the PostgREST queries and RPC calls against a real Supabase project, behaviour in real browsers and screen readers, behaviour under truly parallel edits from two real sessions (stale handling is tested with simulated errors; the database-level concurrency tests are sequential).

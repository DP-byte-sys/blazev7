# ADR 0004: Authentication (Phase 3)

- Status: proposed (2026-10-29). Verified only against fake auth clients in tests; not yet against a real Supabase project.

## Decisions

- Email + password via Supabase Auth. Clients use only the publishable key.
- Mobile: session stored in Expo SecureStore through a chunked adapter (sessions exceed SecureStore's per-value guidance). Tokens are never written to SQLite. Token refresh runs only while the app is in the foreground.
- Web: supabase-js default (localStorage) session storage. Trade-off: readable by injected scripts, so the web app must stay free of XSS (no raw HTML injection, restricted script hosts).
- Route guards (Expo Router `Stack.Protected`, React Router wrappers) are UI conveniences. Real access control is RLS plus server-side functions (ADR 0003).
- The profile (name, role, active) is read from `public.profiles` after sign-in and used for display and UI gating only. The role is never taken from the client or from token metadata; the database trigger always assigns `requester`.
- Auth errors are mapped to a fixed set of safe messages (no raw server text, no hint whether an email exists).
- Deactivated accounts are signed out with a notice (the database already denies them all access).
- The staff web portal shows "Staff access only" to requesters and "No access" for admin pages to non-admins.

## Assumptions / open decisions (owner to confirm)

- B1: No self-registration in V1 apps; users are created by an administrator (dashboard for now, an admin UI later).
- B2: No password reset or change-password screens yet.
- B3: Requesters use only the mobile app; the web portal is staff-only.
- B4: Email confirmation, password policy, MFA and session lifetime are Supabase dashboard settings still to be decided before UAT.
- B5: First admin is bootstrapped once with SQL (see docs/supabase-setup.md).

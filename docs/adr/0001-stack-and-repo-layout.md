# ADR 0001: Stack and repository layout

- Status: accepted (2026-10-28)
- Decision: single repo; `apps/mobile` (Expo), `apps/web` (Vite React TS), `packages/shared`, `supabase/`. Each app has its own `package.json`/install (no npm workspaces) because Expo monorepo hoisting is fragile.
- Consequence: run `npm install` in each of `apps/web`, `apps/mobile`, `packages/shared`, and root.
- Note: scaffold generators pinned TypeScript ~7 (web) and ~6 (mobile); keep as generated, revisit if tooling breaks.

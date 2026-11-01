# Blaze

**Full setup instructions: see [`setup.md`](setup.md)** (kept up to date as the project changes).

Ticketing system: Expo requester app + React agent/admin web portal + Supabase. Full setup instructions: **`setup.md`**. See `prd.md`, `design.md`, `architecture.md`, `phases.md`, and `memory.md` (current status).

## Setup (Windows PowerShell)

```powershell
node -v; npm -v; git --version
npm install
npm install --prefix packages/shared
npm install --prefix apps/web
npm install --prefix apps/mobile
npm run check          # format, typecheck, lint, tests, web build
npm --prefix apps/web run dev      # web at http://localhost:5173
npm --prefix apps/mobile run start # scan QR with Expo Go on your Android phone
```

Never commit `.env` files or secrets.

## Connect to Supabase (DEV)

See `docs/supabase-setup.md`. Copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the URL and publishable key. Without them the apps run but show a "not connected to a backend" notice on sign-in.

## Environments and releases

See `docs/environments.md` (DEV/UAT/staging/production, secrets), `docs/release-runbook.md` (CI, deploy gates, smoke checks, rollback), `docs/mobile-distribution.md` (Android builds) and `docs/operations.md` (monitoring, backups, incidents).

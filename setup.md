# Blaze - Setup Guide

This is a **living document**. Whenever a tool, dependency, environment variable, script or setup step changes, update this file in the same change (see "Keeping this file current" at the bottom).

- Last updated: 2026-10-31
- Shell: Windows PowerShell (macOS/Linux users: the same commands work, except `Copy-Item` -> `cp`)
- Related: `README.md` (short version), `memory.md` (project status), `docs/supabase-setup.md` (connect to Supabase), `docs/adr/` (decisions)

---

## 1. What you need installed

| Tool                                           | Why                                                                                                                   | How to check       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Node.js 22 LTS** (includes npm)              | runs everything; CI uses Node 22                                                                                      | `node -v`          |
| **Git for Windows**                            | version control                                                                                                       | `git --version`    |
| **VS Code** (recommended) + Prettier extension | editing and formatting                                                                                                | -                  |
| **Expo Go** (Android Play Store)               | runs the mobile app on your phone during development                                                                  | -                  |
| **GitHub account**                             | private repo + CI                                                                                                     | -                  |
| _Later, optional:_ **Docker Desktop + WSL2**   | needed to run Supabase locally (`supabase start`) and for `supabase db dump`; CI runs the real-stack check without it | `docker --version` |

Supabase CLI needs no separate install: use `npx supabase ...`.

Verify:

```powershell
node -v
npm -v
git --version
```

If PowerShell refuses to run `npm`/`npx` scripts ("running scripts is disabled"), run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 2. Get the project

Extract the project ZIP (or clone your private repo) to a **short path with no spaces**, e.g. `C:\dev\blaze`:

```powershell
cd C:\dev\blaze
```

First time only, if you want it on GitHub (create an empty **private** repo named `blaze` first, with no README):

```powershell
git init -b main
git add .
git status          # check: no .env files and no node_modules listed
git commit -m "chore: initial import"
git remote add origin https://github.com/YOUR-USERNAME/blaze.git
git push -u origin main
```

---

## 3. Install dependencies

This repo has **four separate installs** (apps are independent on purpose, see `docs/adr/0001`). Run all four, from the repo root:

```powershell
npm install
npm install --prefix packages/shared
npm install --prefix apps/web
npm install --prefix apps/mobile
```

- Use `npm ci` instead of `npm install` when you want an exact, reproducible install from the lockfiles (this is what CI does).
- Warnings such as "npm audit found vulnerabilities" are expected right now. Do **not** run `npm audit fix --force` (it can break Expo compatibility).

What each install provides:

| Folder            | Main packages                                                                                                                                                                                                                                                                                        | Purpose                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| root              | `prettier`, `vitest`, `@electric-sql/pglite`                                                                                                                                                                                                                                                         | formatting; database tests that run the SQL migrations on an in-memory PostgreSQL |
| `packages/shared` | `typescript`                                                                                                                                                                                                                                                                                         | shared types (status, priority, roles)                                            |
| `apps/web`        | `react`, `react-dom`, `react-router-dom`, `vite`, `@supabase/supabase-js`, `@fontsource/plus-jakarta-sans`, `vitest`, `@testing-library/*`, `oxlint`                                                                                                                                                 | staff web portal                                                                  |
| `apps/mobile`     | `expo`, `expo-router`, `react-native`, `@supabase/supabase-js`, `expo-secure-store`, `expo-sqlite` (local drafts), `expo-crypto` (idempotency keys), `zustand` (UI state), `react-native-url-polyfill`, `@expo-google-fonts/plus-jakarta-sans`, `jest`, `jest-expo`, `@testing-library/react-native` | requester mobile app                                                              |

Version pins to be aware of: in `apps/mobile`, `react-dom` and `react-test-renderer` are pinned to **19.3.0** to match `react`; npm reports a peer-dependency error otherwise.

---

## 3b. Environment variables

Only **public/publishable** values go in these files. The `.env*` files are git-ignored; never commit them and never use the Supabase `service_role` / secret key in any app.

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

| File                  | Variable                               | Value                            |
| --------------------- | -------------------------------------- | -------------------------------- |
| `apps/web/.env.local` | `VITE_SUPABASE_URL`                    | your Supabase project URL        |
| `apps/web/.env.local` | `VITE_SUPABASE_PUBLISHABLE_KEY`        | publishable (or legacy anon) key |
| `apps/mobile/.env`    | `EXPO_PUBLIC_SUPABASE_URL`             | your Supabase project URL        |
| `apps/mobile/.env`    | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable (or legacy anon) key |

Without values the apps still start, and the sign-in screen says "not connected to a backend". To get a project and the values, follow `docs/supabase-setup.md`. After changing env values, restart the dev server (mobile: `npx --prefix apps/mobile expo start -c`).

---

Added for environments (Phase 7):

| File / place                                    | Variable               | Value                                                                                                 |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/web/.env.local` (and the deploy workflow) | `VITE_APP_ENV`         | `development` (default), `uat`, `staging` or `production`. Anything else shows the development banner |
| EAS build profile (`apps/mobile/eas.json`)      | `APP_ENV`              | same four values; picks the app name, scheme, Android package and the banner                          |
| EAS environment variable                        | `ANDROID_PACKAGE_BASE` | your reverse-domain id, e.g. `com.yourcompany.blaze`; **required for production builds**              |

Deployment secrets and per-environment variables (GitHub, Cloudflare, Supabase, EAS) are listed in `docs/environments.md` section 3.

## 4. Verify the whole project

```powershell
npm run check
```

Runs, in order: Prettier check, shared typecheck, root tests (database, security, operations and shared-package unit tests), web lint, web tests, web build, mobile typecheck, mobile tests. It should finish without errors. Run it before every commit/PR; CI runs the same command.

---

## 5. Run the apps

**Web portal**

```powershell
npm --prefix apps/web run dev
```

Open the printed address (normally http://localhost:5173). Stop with `Ctrl+C`.

**Mobile app (Android, Expo Go)**

```powershell
npm --prefix apps/mobile run start
```

1. Phone and PC on the same Wi-Fi.
2. Open Expo Go and scan the QR code in the terminal.
3. Can't connect? Stop the server and use `npm --prefix apps/mobile run start -- --tunnel` (Windows Firewall or guest Wi-Fi is the usual cause).
4. Expo Go says the SDK is unsupported? Send the exact message; the Expo SDK version in `apps/mobile/package.json` must match what Expo Go supports.

---

## 6. Command reference

From the repo root:

| Command                                       | What it does                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                               | everything CI runs                                                                                                                                                                                       |
| `npm run format` / `npm run format:check`     | format files / check formatting                                                                                                                                                                          |
| `npm run db:test`                             | all root tests: database, security and operations tests (in-memory PostgreSQL; applies every file in `supabase/migrations/` in order) plus unit tests for `packages/shared` (`tests/db/`, `tests/unit/`) |
| `npm run web:lint` / `web:test` / `web:build` | web lint / tests / production build                                                                                                                                                                      |
| `npm run mobile:typecheck` / `mobile:test`    | mobile typecheck / tests                                                                                                                                                                                 |
| `npm run shared:typecheck`                    | typecheck the shared package                                                                                                                                                                             |

---

| Command                                                                       | What it does                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run security:scan`                                                       | fails if secret-looking content (service-role keys, private keys, non-anon JWTs, database URLs with passwords) or tracked `.env`/key files are found; part of `npm run check` |
| `npm run release:check -- --version v1.0.0 --stage production --commit <sha>` | checks `docs/releases/<version>.md` is complete for `uat`, `staging` or `production` (the deploy workflow runs this)                                                          |
| `npm run smoke`                                                               | read-only smoke checks of a deployed site and Supabase API; needs `SMOKE_WEB_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_KEY` (publishable key only)                          |

## 7. Project layout

```text
apps/mobile/       Expo requester app (routes in app/, code in src/)
apps/web/          React + Vite staff portal
packages/shared/   shared TypeScript types
supabase/          migrations/ (SQL), seed.sql (synthetic data), functions/ (empty for now)
tests/db/          database/security tests
docs/              ADRs (docs/adr/) and Supabase setup
.github/workflows/ CI
prd.md design.md architecture.md phases.md memory.md   project documents
```

---

Added in Phase 7: `scripts/` (secret scan, release-record gate, smoke checks), `supabase/config.toml` and `supabase/tests/database/` (pgTAP tests run by `supabase test db`), `docs/releases/` (one release record per version), `docs/environments.md`, `docs/release-runbook.md`, `docs/mobile-distribution.md`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`, `apps/mobile/app.config.ts` + `eas.json`, `apps/web/public/_headers` + `_redirects`.

## 8. Supabase (backend)

- **Hosted DEV project (needed to sign in for real):** follow `docs/supabase-setup.md`.
- **Local Supabase (optional, later):** install Docker Desktop with WSL2, then from the repo root `npx supabase init` (first time), `npx supabase start`, and `npx supabase db reset` (applies migrations + `supabase/seed.sql`). Not yet verified on this project (see `memory.md`).
- Database changes are **always new migration files** in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit a migration that has been applied to a real project.

---

## 9. Adding or changing dependencies

1. Install in the right folder:
   - Mobile / Expo-native packages: `cd apps/mobile`, then `npx expo install <package>` (picks the version that matches the Expo SDK). Plain JS libraries can use `npm install <package>`.
   - Web: `npm install <package> --prefix apps/web` (dev tools with `-D`).
   - Root tooling: `npm install -D <package>` at the root.
2. Never mix lockfiles: commit the changed `package-lock.json`.
3. Before upgrading Expo or any native package, check the current official Expo compatibility guidance first.
4. Run `npm run check`. For mobile changes also confirm the app still starts in Expo Go.
5. Update **this file** (tables in sections 3, 3b, 6) and add a line to the changelog below. If it is a significant choice, also add an ADR in `docs/adr/`.
6. Update `memory.md` (status/change log).

---

## 10. Troubleshooting

| Problem                                                | Fix                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERESOLVE unable to resolve dependency tree` on mobile | a React-family package version drifted; keep `react`, `react-dom`, `react-test-renderer` on the same version (19.3.0). Do not use `--force` or `--legacy-peer-deps` unless you know why. |
| Env values not picked up                               | restart the dev server; for mobile use `expo start -c`                                                                                                                                   |
| Metro/Expo shows stale errors                          | `npx --prefix apps/mobile expo start -c`                                                                                                                                                 |
| Port 5173 already in use                               | stop the other dev server, or Vite will offer the next port                                                                                                                              |
| `node_modules` looks broken                            | delete that folder and its lockfile-free reinstall: `Remove-Item -Recurse -Force node_modules; npm ci` (inside the affected folder)                                                      |
| Path too long / odd Windows errors                     | use a short path such as `C:\dev\blaze`; avoid OneDrive-synced folders                                                                                                                   |
| `npm run check` fails on formatting                    | run `npm run format`, then re-run the check                                                                                                                                              |
| CI fails but local passes                              | run `npm ci` (not `npm install`) in all four places, then `npm run check`                                                                                                                |

---

| `npm run security:scan` reports a finding | open the file and line it names, remove the value, use a secret store, and **rotate the secret if it was ever pushed**. The scanner never prints the value. Public anon/publishable keys are allowed |
| `expo` says production builds need `ANDROID_PACKAGE_BASE` | set your real reverse-domain id as an EAS variable (`docs/mobile-distribution.md`); production builds refuse the placeholder on purpose |
| `supabase db push` asks for confirmation in CI | there is no `--yes` flag (checked on CLI 2.122); non-interactive runs proceed without a prompt. Always read the `--dry-run` output first |

## 11. Keeping this file current

**Rule:** any change that affects how someone installs, configures, runs or tests Blaze must update `setup.md` in the same commit/PR. That includes: new or removed tools, dependencies, environment variables, scripts, folders that need their own install, services (Docker, Supabase CLI, EAS, hosting) and Windows-specific workarounds.

How to add an entry:

1. Edit the relevant section above (tables, steps, troubleshooting).
2. Change "Last updated" at the top.
3. Add one line to the changelog below: date, what changed, why.
4. If AI-assisted: ask the assistant to "update setup.md and memory.md" as part of finishing the task.

### Setup changelog

- 2026-10-29: Created. Documents Node 22, four separate installs, env files for Supabase (web and mobile), `npm run check`, test tooling (Vitest, Jest, PGlite) and Supabase hosted/local options.
- 2026-10-30: Phase 4 added mobile packages `zustand`, `expo-sqlite`, `expo-crypto` (installed with `npx expo install`) and migration `20261029000004`. Hosted projects need `npx supabase db push` again to receive it (4 migrations total). No new env variables.
- 2026-10-30: Phase 5 (staff workflows) added no new npm packages and no new env variables. `supabase/migrations/` now has 5 files (versions `...000001` to `...000005`); hosted projects need `npx supabase db push` again. The idempotency migration was renamed from `...000004_...` to `...000005_...` to keep versions unique: migration versions must never be reused.
- 2026-10-30: Phase 6 added no npm packages and no env variables. New: migration `20261030000001_ops_outbox_and_rate_limits.sql` (6 migrations now; hosted projects need `npx supabase db push`), `tests/unit/` (root tests now also cover `packages/shared`), `apps/mobile/jest.setup.ts` (silences logs during tests), `docs/operations.md` (runbook). `npm run db:test` now runs every root test.
- 2026-10-31: Requester reply/reopen on mobile added no npm packages, no env variables and no migrations. Mobile test count is now 120 (`npm run mobile:test`).
- 2026-10-31: Phase 7 (CI/CD and environments) added no npm packages. New: `npm run security:scan` (in `npm run check`), `release:check`, `smoke`; `supabase/config.toml` and pgTAP tests; `VITE_APP_ENV`, `APP_ENV`, `ANDROID_PACKAGE_BASE`; `apps/mobile/app.config.ts` and `eas.json`; web `_headers`/`_redirects`; workflows `ci.yml` (rewritten), `deploy.yml`, `dependabot.yml`; docs `environments.md`, `release-runbook.md`, `mobile-distribution.md`, `releases/TEMPLATE.md`. Docker Desktop is recommended for `supabase start`. The Supabase CLI is run with `npx supabase ...` (CLI 2.122 was used to confirm flags).

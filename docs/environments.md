# Blaze - Environments, configuration and secrets

Status: **proposal** (ADR 0008). Plan limits below come from third-party summaries and vendor pages found in 2026-10; **re-check the official pages before you buy or rely on anything** (supabase.com/pricing, Cloudflare Pages limits, expo.dev/pricing, GitHub plans).

## 1. Rules for every environment

1. **Isolation is real, not a label:** each environment has its own Supabase project (own database, own keys, own Auth users), its own hosting project, and its own mobile app identity. Nothing is shared except the code.
2. **Only production holds real data.** Everything else uses synthetic data and test accounts. Never copy production data into UAT/staging unless it is anonymised first and the owner approves.
3. **Every non-production build shows a banner** ("UAT environment: test data only", also in the mobile app) so nobody mistakes it for production. Unknown or missing `VITE_APP_ENV`/`APP_ENV` shows the development banner (loud on purpose).
4. **Secrets live in platform secret stores**, never in Git, chat or `.env` files that are committed. The apps hold only public values (URL, publishable key). `npm run security:scan` runs in every `npm run check` and in CI.
5. **Same code, different configuration.** The web app bakes its settings in at build time, so each environment is built from the same tag with that environment's public values (this is rebuilt, not copied: see ADR 0008 F4).

## 2. The four environments

|                            | DEV                                                            | UAT                                  | STAGING                                                        | PRODUCTION                                 |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| Purpose                    | daily development                                              | users and owner accept the release   | rehearse the exact release: migrations, smoke checks, recovery | real use                                   |
| Supabase                   | **local** (`supabase start`, needs Docker) or one free project | hosted project `blaze-uat`           | hosted project `blaze-staging` (see options)                   | hosted project `blaze-prod`, **paid plan** |
| Web                        | `localhost:5173`                                               | Cloudflare Pages project `blaze-uat` | `blaze-staging`                                                | `blaze-prod` (+ custom domain later)       |
| Mobile                     | Expo Go / dev build, `Blaze (Dev)`                             | APK `Blaze (UAT)` (`.uat` package)   | APK `Blaze (Staging)`                                          | `Blaze` (AAB, Play Store later)            |
| Data                       | seed.sql (synthetic)                                           | test accounts + synthetic tickets    | synthetic, production-like volume if useful                    | real                                       |
| `VITE_APP_ENV` / `APP_ENV` | development                                                    | uat                                  | staging                                                        | production                                 |
| Config key prefix          | `DEV_`                                                         | `UAT_`                               | `STAGING_`                                                     | `PROD_`                                    |
| Deployed by                | you, locally                                                   | Deploy workflow (`uat`)              | Deploy workflow (`staging`)                                    | Deploy workflow (`production`)             |

**Cost-aware options** (the docs' rule is to avoid four paid environments while keeping the release gates):

- _Minimum:_ DEV local (free), UAT on a Free Supabase project, STAGING as the second Free project, PRODUCTION on a Pro organisation. Supabase Free allows **2 active projects** (some sources say per organisation, others across all; verify), **has no automatic backups**, and **pauses a project after about 7 days without activity** (you can restore it from the dashboard; data is kept). Consequence: unpause UAT/staging before a test session or release rehearsal and expect a minute of delay.
- _Cheaper staging:_ create the staging project only for the release rehearsal and delete it afterwards (the gate asks for a smoke check and a recovery rehearsal, not for a permanent environment).
- _Do not_ run production on a Free project: no backups, and it pauses when idle. Pro is about $25 per organisation per month plus compute for additional projects (verify the calculator); it includes daily backups kept for 7 days.
- Cloudflare Pages Free: unlimited bandwidth, 500 builds/month, commercial use allowed (checked 2026-10; verify whether direct uploads from GitHub Actions count against the build quota). Vercel's free "Hobby" plan is for non-commercial use only, so it is not recommended for a business tool.

## 3. Configuration and secrets inventory

GitHub: Settings -> Secrets and variables -> Actions. On GitHub Free **private** repositories, per-environment secrets and approvals are not available, so values are **repository-level with an environment prefix**. If you later move to a plan with Environments, the same names still work.

| Name                             | Kind              | Needed for              | Notes                                                                       |
| -------------------------------- | ----------------- | ----------------------- | --------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`          | **secret**        | `supabase link/db push` | personal access token from your Supabase account; rotate every 90 days      |
| `<ENV>_SUPABASE_DB_PASSWORD`     | **secret**        | `db push`               | the project's database password (per environment)                           |
| `<ENV>_SUPABASE_PROJECT_REF`     | variable          | `db push`               | the id in the project URL                                                   |
| `<ENV>_SUPABASE_URL`             | variable (public) | web build, smoke        | `https://<ref>.supabase.co`                                                 |
| `<ENV>_SUPABASE_PUBLISHABLE_KEY` | variable (public) | web build, smoke        | the publishable (or legacy anon) key. **Never the secret/service-role key** |
| `<ENV>_WEB_URL`                  | variable          | smoke                   | the stable public URL of that environment's site                            |
| `<ENV>_CF_PROJECT`               | variable          | deploy                  | Cloudflare Pages project name for that environment                          |
| `CLOUDFLARE_ACCOUNT_ID`          | variable          | deploy                  | from the Cloudflare dashboard                                               |
| `CLOUDFLARE_API_TOKEN`           | **secret**        | deploy                  | create a token limited to "Cloudflare Pages: Edit" for your account         |

`<ENV>` is one of `DEV`, `UAT`, `STAGING`, `PROD`.

Mobile (set with the EAS CLI, never in Git): per build profile `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public), plus `ANDROID_PACKAGE_BASE`. See `docs/mobile-distribution.md`.

**The Supabase service-role key is not used by anything today** and must never appear in a client or in GitHub variables. The future notification worker keeps it in its own platform's secret store.

## 4. Setting up an environment (UAT first)

1. **Supabase:** create the project (never reuse another environment's), turn off "Allow new users to sign up", set Auth rate limits, then follow `docs/supabase-setup.md` sections 2 to 4 (migrations, reference data, first admin) for that project.
2. **Cloudflare Pages:** `npx wrangler login`, then `npx wrangler pages project create blaze-uat --production-branch main` (check `npx wrangler pages project create --help`). Repeat per environment.
3. **GitHub variables/secrets:** add the rows from the table for this environment (prefix `UAT_`).
4. **Release record and tag:** follow `docs/release-runbook.md`.
5. **Deploy:** Actions -> Deploy -> Run workflow (environment `uat`, ref `v0.1.0`, tick _apply_migrations_ the first time).
6. **Verify:** the smoke job passes; open the site: the yellow banner reads "UAT environment"; sign in with a UAT test account.

## 5. Isolation checklist (tick per environment before first use)

- [ ] Own Supabase project, own database password, own publishable key.
- [ ] Sign-ups off unless deliberately on; Auth rate limits reviewed.
- [ ] Own Cloudflare Pages project; the site shows the environment banner.
- [ ] Mobile variant has its own package id and name (it installs next to the others).
- [ ] No production data and no production keys in it; test users only.
- [ ] Variables use the right prefix; no secret is stored as a variable.

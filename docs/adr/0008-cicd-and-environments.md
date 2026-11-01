# ADR 0008: CI/CD and environments (Phase 7)

- Status: proposed (2026-10-31). Workflows are validated with `actionlint`; scripts and the pgTAP file are tested locally with fakes or an in-memory database. **Nothing has run on GitHub, Cloudflare, Supabase or EAS yet.**

## Decisions made in code

- **CI** (`.github/workflows/ci.yml`): `Checks` (format, secret scan, typecheck, all tests, web build), `Dependency audit`, and `Supabase local stack` (real stack in Docker on the runner: `db reset` applies every migration and the seed, `supabase test db` runs pgTAP, then the anonymous-access smoke checks hit the real API). This is the first time the database is verified on real Supabase without the owner installing Docker.
- **Deploy** (`.github/workflows/deploy.yml`): manual only, one environment at a time. Gates that work on any GitHub plan: CI must have passed for the exact commit; staging/production need a release tag and a complete release record (read from the default branch, so evidence gathered after tagging needs no re-tag) that names exactly that commit; production needs a typed confirmation. Optional migration step prints a dry run before applying. Then build, deploy to Cloudflare Pages, and run read-only smoke checks.
- **Config and secrets:** repository variables/secrets named with an environment prefix (`UAT_`, `STAGING_`, `PROD_`, `DEV_`) so everything works on GitHub Free private repositories; the same names work with Environments later. Only public values (URL, publishable key) are variables; real secrets are Actions secrets. `scripts/scan-secrets.mjs` blocks committed secrets and runs in `npm run check`.
- **Environment awareness:** web `VITE_APP_ENV` and mobile `APP_ENV` select a banner (everything except production shows one; unknown shows development) and, on mobile, a separate app name/scheme/Android package per environment.
- **Static hosting files:** `_redirects` (SPA fallback) and `_headers` (CSP, nosniff, frame-ancestors, referrer policy), checked by tests and by the smoke script.
- **Dependabot** weekly grouped PRs; Expo/React Native packages are excluded (they move with the Expo SDK).

## Assumptions / open decisions (owner to confirm)

- F1: **Web host: Cloudflare Pages** (free, commercial use allowed, unlimited bandwidth, 500 builds/month, one project per environment), deployed by direct upload from GitHub Actions. Alternatives: Netlify (credit-based free plan), GitHub Pages (private repos need a paid plan), Vercel Hobby (non-commercial only: not recommended).
- F2: **Environment mix:** DEV local (Docker) or one free project; UAT and staging on Supabase Free (2 active projects, no backups, pause after ~7 idle days); PRODUCTION on a paid Supabase plan (Pro ~$25/organisation/month plus compute, daily backups for 7 days). Staging may be created only for the release rehearsal. This has recurring cost only for production.
- F3: **GitHub plan:** on Free private repositories GitHub cannot enforce required status checks, branch rules or environment approvals. Either upgrade (or make the repo public: not recommended) or accept that these steps are personal discipline backed by the workflow's own gates. The gates in `deploy.yml` can be bypassed by anyone with write access (they protect against mistakes, not against a malicious collaborator).
- F4: **Build per environment from the same tag**, not "build once, promote the artifact": the Vite app bakes its Supabase URL/key in at build time. Reproducibility comes from lockfiles, `npm ci` and the tag. (Runtime configuration could change this later.)
- F5: **Release identity:** semantic version tags (`vX.Y.Z`, release candidates `vX.Y.Z-rc1`) and one release record per version in `docs/releases/`. UAT acceptance, staging smoke, recovery rehearsal, backup, rollback plan and production approval are written there by a person.
- F6: **Android package id** is a placeholder (`com.example.blaze`); production builds refuse it. Choose your real id before the first store build: it cannot change after publishing.
- F7: **Audit policy:** root/shared/web block on high/critical; mobile (30 findings in Expo's toolchain, 2 high) is report-only and reviewed weekly.
- F8: The **Content-Security-Policy** is strict (`script-src 'self'`, Supabase as the only external host). It has not been exercised in a real browser: check the console on UAT after the first deploy and after adding a custom Supabase domain.
- F9: **Docker Desktop** becomes useful for local development (`supabase start`) although CI already covers the real-stack check.
- F10: **EAS** free-plan builds are limited and queued at low priority; builds are started by hand (`docs/mobile-distribution.md`).

## Verification status

Not verified: any GitHub Actions run (including the real-stack job and the `supabase db push` / `wrangler pages deploy` steps), the live smoke run, Cloudflare/EAS account setup, headers in a real browser, and the first real Android build. The workflow syntax and expression checks pass `actionlint`; the pgTAP file's 15 expectations pass against the in-memory database with a stand-in for the pgTAP functions.

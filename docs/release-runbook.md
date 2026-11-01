# Blaze - Release runbook (CI/CD, gates, smoke checks, rollback)

Status: **draft**. The workflows were validated with `actionlint` and their helper scripts are unit-tested, but **none of it has run on GitHub or against real services yet**; expect small fixes on the first runs. Read `docs/environments.md` first.

## 1. What is enforced and what is not (important)

| Control                                                                                                     | Enforced by                                               | Notes                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format, secret scan, types, tests, build run on every PR and push to `main`                                 | CI job `Checks ...`                                       | Fails the PR check; **a PR can still be merged by someone with write access unless the repo enforces checks**                                                                                                                                                                        |
| Dependency audit                                                                                            | CI job `Dependency audit`                                 | root/shared/web block on high or critical; mobile is report-only (see section 6)                                                                                                                                                                                                     |
| Migrations apply to a **real** Supabase stack; pgTAP security tests; anonymous-access smoke on the real API | CI job `Supabase local stack ...`                         | first run on GitHub will also verify `supabase/seed.sql` on real `auth.users`                                                                                                                                                                                                        |
| A deploy needs a commit that passed CI                                                                      | Deploy workflow gate (queries the check run)              | works on any GitHub plan                                                                                                                                                                                                                                                             |
| Staging/production need a complete release record for the same commit                                       | Deploy workflow gate + `scripts/check-release-record.mjs` | evidence is written by a person; the script checks it exists and is consistent                                                                                                                                                                                                       |
| Production needs a typed confirmation                                                                       | Deploy workflow gate                                      | `DEPLOY vX.Y.Z TO PRODUCTION`                                                                                                                                                                                                                                                        |
| Required PR reviews, required status checks on `main`, environment approvals                                | **GitHub plan features**                                  | On **GitHub Free private repositories these are not available** (they need Pro/Team, or a public repo; verified in 2026-10 docs: confirm on github.com/pricing). Options: upgrade, or treat them as personal discipline: never merge with a red check, never push to `main` directly |

When your plan allows it, turn on: a branch ruleset for `main` (require a pull request, require the check named `Checks (format, secrets, types, tests, build)`, block force pushes) and Environments `staging` and `production` with required reviewers.

## 2. Day-to-day flow

1. Branch from `main` (`feature/...`), small PRs, `npm run check` locally first.
2. Open a PR: CI runs. Fix red checks. Merge when green.
3. `main` is always releasable. DEV deploys are manual (`Deploy` -> `dev`, a branch name is allowed).

## 3. Releasing (UAT -> staging -> production)

The release record lives in Git (`docs/releases/vX.Y.Z.md`) and the deploy gate reads it **from the default branch**, so you can add evidence after tagging without moving the tag.

1. **Pick a version** (semantic: `v0.1.0`) and make sure the commit you want has a green CI run.
2. **Tag:** `git tag v0.1.0 <commit>` then `git push origin v0.1.0`.
3. **Open the record:** copy `docs/releases/TEMPLATE.md` to `docs/releases/v0.1.0.md`, fill `Version` and `Git commit` (the tagged commit) and merge it to `main`.
4. **UAT:** run _Deploy_ with `uat`, `v0.1.0` (tick _apply_migrations_ if the release has migrations). When the smoke job passes, run the UAT scenarios in `phases.md` Phase 8 with test accounts (web and the UAT APK). Write `UAT accepted by`, `UAT scenarios recorded: yes` and `Open critical/high security defects: 0` in the record and merge it to `main`.
5. **Staging:** run _Deploy_ with `staging` (the gate now requires the UAT lines). Rehearse the release: migrations on a production-like database, smoke checks, and the **recovery rehearsal** from `docs/operations.md` section 5. Write `Staging smoke` and `Recovery rehearsal`, merge to `main`.
6. **Production:** take a backup (`docs/operations.md` section 5) and write `Pre-release backup`, `Rollback plan` and `Production approved by`; merge to `main`. Run _Deploy_ with `production` (tick _apply_migrations_ if needed) and type `DEPLOY v0.1.0 TO PRODUCTION`.
7. **Verify and record:** the smoke job must pass; watch the logs for an hour (`docs/operations.md` section 1); note incidents in `memory.md`.
   If a defect forces a fix, **cut a new tag** (`v0.1.1`) and a new record: a record always describes exactly one commit, and the gate rejects a mismatch.

## 4. What the smoke checks do (`scripts/smoke.mjs`)

Read-only, using only the publishable key. **Web:** https, home page loads, built assets exist and are not HTML, deep links fall back to the app, security headers (`nosniff`, `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`). **API:** auth service is healthy, and an anonymous caller **cannot read** tickets, events, comments, profiles, notification outbox, rate limits or the admin audit log and **cannot call** the worker or admin functions. A failure of any check fails the deploy job. Run it by hand:

```powershell
$env:SMOKE_WEB_URL = "https://blaze-uat.pages.dev"
$env:SMOKE_SUPABASE_URL = "https://YOUR_REF.supabase.co"
$env:SMOKE_SUPABASE_KEY = "YOUR_PUBLISHABLE_KEY"
npm run smoke
```

Signed-in flows (create ticket, assign, resolve) are covered by UAT scenarios, not by automated smoke checks, so smoke never writes data.

## 5. Rolling back

- **Web:** run _Deploy_ again with the **previous release tag** (same environment). Takes a few minutes. Cloudflare Pages also keeps old deployments you can promote from its dashboard.
- **Database:** migrations are **forward-only**. Fix a bad migration with a new migration. If data is damaged, restore from backup into a throwaway project first and verify (`docs/operations.md` section 5). Destructive statements are blocked by a test and need explicit approval.
- **Mobile:** stop distributing the bad build; ship a fixed build. Keep the previous APK for sideloaded testers. A bad migration that the old app cannot handle is the reason to keep the API backward compatible for one release (add columns before using them; remove them one release later).
- Write what happened in `memory.md` and the release record.

## 6. Dependencies and audit policy

- `npm audit` baseline (2026-10-30, production dependencies): root, `packages/shared`, `apps/web`: **0 vulnerabilities**. `apps/mobile`: 30 (1 low, 27 moderate, 2 high), all transitive in the Expo toolchain (high: `@expo/cli`, `zod`; no direct fix offered). They do not ship inside the app bundle the same way server code would, but review them.
- Policy: a high/critical finding in root/shared/web **blocks CI**. Mobile findings are reported on every run (non-blocking); review them weekly and when upgrading the Expo SDK. Never run `npm audit fix --force` on mobile.
- Dependabot opens weekly grouped PRs for minor/patch updates (config in `.github/dependabot.yml`). Expo/React Native packages are ignored by Dependabot because they must move together with the Expo SDK: upgrade with `npx expo install --fix` after reading the SDK release notes, test in Expo Go and a UAT build, and update `setup.md`.

## 7. Secrets

Inventory and rotation: `docs/environments.md` section 3. `npm run security:scan` fails on secret-looking content (service-role keys, non-anon JWTs, private keys, database URLs with passwords) and on tracked `.env`/key files; it never prints the secret. If a secret is ever committed or pasted anywhere: **rotate it first**, then remove it from the code (history rewriting does not make it safe).

## 8. First-run checklist for the pipelines

- [ ] Push the repo to GitHub; the `CI` workflow runs: fix anything red (the real-stack job is the most likely to need a tweak: it has never run).
- [ ] Add the variables/secrets for UAT; create the Cloudflare Pages project; run _Deploy_ for `uat` with a release-candidate tag.
- [ ] Confirm the smoke job passes and the UAT site shows the banner and sign-in works.
- [ ] Decide on the GitHub plan question (section 1) and enable what it allows.

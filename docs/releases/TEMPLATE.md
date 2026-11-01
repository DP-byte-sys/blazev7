# Release record: copy this file to docs/releases/vX.Y.Z.md and fill it in (one file per release)

The deploy workflow refuses staging/production deployments until this record is complete (scripts/check-release-record.mjs).
Replace every <placeholder>. Dates are YYYY-MM-DD. Each line is `Key: value`.

Version: <vX.Y.Z>
Git commit: <full or short commit id the tag points to>

## UAT (required before staging)

UAT accepted by: <Name on YYYY-MM-DD>
UAT scenarios recorded: <yes>
Open critical/high security defects: <0>

## Staging (required before production)

Staging smoke: <PASSED on YYYY-MM-DD>
Recovery rehearsal: <PASSED on YYYY-MM-DD>

## Production

Pre-release backup: <yes, where it is stored>
Rollback plan: <what you will redeploy or fix-forward if it goes wrong, at least a sentence>
Production approved by: <Name on YYYY-MM-DD>

## Notes

- UAT scenarios and results: <link or short list, see phases.md Phase 8>
- Migrations in this release: <names, and whether any is risky>
- Known issues accepted for this release: <none or list>

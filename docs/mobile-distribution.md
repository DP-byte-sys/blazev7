# Blaze - Mobile build and distribution (Android first)

Status: **draft, nothing built yet.** Expo Go is for development only; testers and production use real builds. Facts about plans: re-check expo.dev/pricing (recent sources list roughly 15 Android + 15 iOS low-priority builds per month on the Free plan; older sources say 30).

## 1. App variants (one codebase)

`apps/mobile/app.config.ts` reads `APP_ENV` and produces four installable variants so they can sit side by side on a phone:

| APP_ENV     | Name            | Android package  | URL scheme          |
| ----------- | --------------- | ---------------- | ------------------- |
| development | Blaze (Dev)     | `<base>.dev`     | `blaze-development` |
| uat         | Blaze (UAT)     | `<base>.uat`     | `blaze-uat`         |
| staging     | Blaze (Staging) | `<base>.staging` | `blaze-staging`     |
| production  | Blaze           | `<base>`         | `blaze`             |

`<base>` is `ANDROID_PACKAGE_BASE`. **Owner decision needed:** pick your own reverse-domain id (for example `com.yourcompany.blaze`). It **cannot be changed after the app is published**. The placeholder `com.example.blaze` is allowed for non-production builds only; a production build refuses to run with it. Every non-production build shows an environment banner on sign-in and Profile.

## 2. One-time setup

```powershell
cd C:\dev\blaze\apps\mobile
npx eas-cli login          # free Expo account
npx eas-cli init           # links the project; commits the project id into app.json/config
```

Set the public settings per build environment (check `npx eas-cli env:create --help` for the current syntax; values are not secrets but keep them out of Git):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the matching Supabase project for that profile) and `ANDROID_PACKAGE_BASE`.
Android signing keys: let EAS generate and store them, then **download a backup of the credentials** (`npx eas-cli credentials`) and keep it offline: losing the production key means you cannot update the published app.

## 3. Building (profiles are in `eas.json`)

```powershell
npx eas-cli build --platform android --profile uat        # APK for UAT testers
npx eas-cli build --platform android --profile staging    # APK for the release rehearsal
npx eas-cli build --platform android --profile production # app bundle (.aab) for the store
```

Each build uses the profile's `APP_ENV`. UAT/staging produce an **APK** with internal distribution: EAS gives you a link/QR code; testers allow "install unknown apps" once. Production produces an **AAB** and auto-increments the version code.

## 4. Distribution

- **UAT/staging:** share the EAS build link with named testers; keep a list of who has which build in the release record.
- **Production:** Google Play (a developer account is required; fee and policies: check Google Play Console). Start with an **internal testing** track, then closed testing, then production. `eas submit` can upload the AAB once the Play app exists.
- iOS is out of scope for now (needs an Apple developer account and a separate decision).

## 5. Release checklist (mobile)

- [ ] `npm run check` is green on the tagged commit (mobile typecheck and tests included).
- [ ] `ANDROID_PACKAGE_BASE` is your real id (production), EAS variables point at the right Supabase project.
- [ ] Build installs next to the other variants and shows the right name and banner.
- [ ] Sign in, create a ticket, reply, reopen on a real phone (`docs/supabase-setup.md` section 7 checklist) against that environment.
- [ ] Credentials backup stored offline; build link and tester list noted in `docs/releases/<tag>.md`.
- [ ] Production only: Play internal testing passed before promoting.

## 6. Not decided / not built

Over-the-air updates (EAS Update), crash reporting, push notifications (no provider yet), automated builds from CI (builds are started by hand with the CLI; automating them is a later option and uses your EAS build quota).

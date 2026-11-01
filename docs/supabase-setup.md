# Connecting Blaze to a Supabase DEV project (Windows PowerShell)

Use a **separate project for DEV only**. Never point these steps at production. Never paste passwords or keys into chat or commit them.

## 1. Create the project

1. supabase.com -> New project -> name it `blaze-dev`. Pick a region near you.
2. Save the database password in a password manager.
3. Note the **project ref** (the id in the project URL).

## 2. Auth settings (dashboard -> Authentication)

- Providers: **Email** enabled.
- Recommended: turn **off** "Allow new users to sign up". The apps have no self-registration screen yet, so only admin-created users should exist (open decision, see ADR 0004).
- Add test users: Authentication -> Users -> Add user -> email + password, tick **Auto Confirm User**. Create at least: one requester, one agent, one admin. Use unique throwaway passwords.

## 3. Apply the database migrations to DEV

```powershell
cd C:\dev\blaze
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run     # shows what will run; expect 6 migrations
npx supabase db push               # applies them to the linked DEV project
```

Do **not** run `supabase/seed.sql` on the hosted project (it creates fake users that cannot sign in).

## 4. Reference data and first roles (dashboard -> SQL Editor)

New users automatically get the `requester` role. Promote your test users once, by email:

```sql
insert into public.teams (name) values ('Network'), ('IT Support');

insert into public.ticket_categories (name, description, sort_order, default_team_id)
select c.name, c.description, c.sort_order, t.id
from (values
  ('Network',  'Wi-Fi, VPN and connectivity',     1, 'Network'),
  ('Hardware', 'Laptops, monitors, peripherals',  2, 'IT Support'),
  ('Accounts', 'Passwords and access',            3, 'IT Support'),
  ('Software', 'Installs and application issues', 4, 'IT Support')
) as c(name, description, sort_order, team_name)
join public.teams t on t.name = c.team_name;

-- one-time bootstrap (afterwards roles change only through the admin_set_user_role function):
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
update public.profiles set role = 'agent'  where id = (select id from auth.users where email = 'YOUR_AGENT_EMAIL');
insert into public.team_members (team_id, user_id)
select t.id, u.id from public.teams t, auth.users u where t.name = 'Network' and u.email = 'YOUR_AGENT_EMAIL';
```

## 5. Give the apps the URL and publishable key

Dashboard -> Project Settings -> API (or "API Keys"): copy the **Project URL** and the **publishable** key (a legacy `anon` key also works). **Never use the `service_role` / secret key.**

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
Copy-Item apps\mobile\.env.example apps\mobile\.env
# edit both files and fill in the two values
npm --prefix apps/web run dev
npx --prefix apps/mobile expo start -c      # -c clears the cache so new env values load
```

## 6. Check it works (report anything that differs)

- [ ] Web: wrong password shows "Incorrect email or password." (no other detail).
- [ ] Web: admin signs in and sees the sidebar; refresh the page and you stay signed in.
- [ ] Web: requester signs in and sees "Staff access only".
- [ ] Web: agent can open Ticket queue but sees "No access" on /categories.
- [ ] Web: Sign out returns to the login page; opening /tickets while signed out redirects to login.
- [ ] Mobile: sign in as the requester; close the app completely and reopen it: still signed in.
- [ ] Mobile: Profile shows name, email and role "requester"; Sign out returns to the sign-in screen.
- [ ] Deactivation: in SQL Editor run `update public.profiles set active = false where id = (select id from auth.users where email = 'YOUR_REQUESTER_EMAIL');` then reopen the app: it signs out and explains why. Set it back to `true` afterwards.

## 7. Phase 4 checks (requester tickets, mobile)

If you set this project up earlier, run `npx supabase db push` again first (migrations 4 and 5 were added; they only replace the `assign_ticket` and `create_ticket` functions). If you already pushed under the earlier name `20261029000004_create_ticket_idempotency_conflict`, tell the assistant before pushing again; that file was renamed to `...000005_...` because two files shared the same version.

- [ ] Sign in as the requester. Home shows "No tickets yet".
- [ ] New ticket: leave fields empty and tap Send: you see the required-field messages and nothing is sent.
- [ ] Fill in title, description, category and tap Send: you land on the ticket with a green "Ticket BLZ-... created. Status: New." message.
- [ ] My tickets lists it; pull down to refresh works.
- [ ] Turn on airplane mode, create another ticket and tap Send: you see "Not confirmed - your draft is saved...". Turn airplane mode off and tap Send again: exactly one ticket is created (check My tickets and the `tickets` table in the dashboard).
- [ ] Start a draft, close the app completely, reopen it: Home says you have an unsent draft and the text is still there.
- [ ] Sign out, sign in as a _different_ user: no draft from the first user is visible.
- [ ] In the dashboard SQL Editor, as an agent in the Network team, run `select * from public.acknowledge_ticket('<ticket id>', 1);` (or use the Table editor to simulate): after that, the requester's ticket detail (pull to refresh) shows "Support acknowledged your ticket". Internal notes added with `add_comment(..., 'internal')` must NOT appear for the requester.
- [ ] The second requester account cannot open the first requester's ticket (not found).

- [ ] Open a ticket in the phone app and tap the reply box: you see "Support will see this reply." Send a reply: "Reply sent." appears only after the server answers, and the reply shows in the timeline as "You replied". In the web portal the same reply appears under the requester's name.
- [ ] As the agent, send a public reply from the portal. Leave the phone ticket screen open (do not touch it): within about 30 seconds the reply appears by itself.
- [ ] Airplane mode: type a reply and tap Send: you see "Can't reach the server..." and your text is still in the box. Turn airplane mode off and send again: exactly one copy appears in the timeline.
- [ ] Resolve the ticket in the portal. On the phone the ticket shows "Reopen this ticket". Tap it, try to submit without a reason (blocked), then enter a reason and submit: the status becomes Reopened and the portal history shows the reason.
- [ ] Send many replies quickly (more than the limit, see `rate_limits`): you see "You're doing that too often..." and the text stays in the box.

## 8. Phase 5 checks (staff web portal)

Sign in to the web portal with an **agent** who belongs to the Network team (see section 4), and keep the requester signed in on the phone.

- [ ] Ticket queue shows only Network-team tickets and tickets assigned to you; a ticket in another team's category is not listed.
- [ ] Open a new ticket: Acknowledge. A green "Ticket acknowledged." appears only after the server answers. Pull to refresh on the phone: the timeline shows "Support acknowledged your ticket".
- [ ] Write an **internal note** and a **public reply**. The phone shows only the public reply. In the portal the internal note is marked "Staff only".
- [ ] Assign the ticket to another agent in the same team. The portal history shows who it was assigned to; the phone timeline shows nothing about the assignment.
- [ ] Start work, then Resolve without a summary (blocked), then with a summary. The phone shows the Resolution text.
- [ ] Reopen from the portal (reason required). Try Reopen/Assign on a resolved ticket: only Reopen is offered.
- [ ] Open the same ticket in two browser tabs. Acknowledge in tab A, then try Acknowledge/Start work in tab B: tab B shows a warning that the ticket changed and refreshes (nothing is overwritten).
- [ ] An agent in a different team cannot open the first agent's ticket by URL (shows "Ticket not found").
- [ ] As **admin**: Users and roles lists everyone; your own role and Deactivate controls are disabled. Change another user's role (confirm dialog); the Audit log shows it. Deactivate a test agent: on their next page load/app start they are signed out.
- [ ] As admin: add a category with a default team; it appears in the phone's New ticket screen (reopen the screen). Toggle an agent's team membership and confirm what that agent sees changes after refresh.
- [ ] As an agent (not admin): Categories, Users and Audit log show "No access".

## 9. Phase 6 checks (operations)

Run `npx supabase db push` first (migration `20261030000001` adds the notification outbox and rate limits).

- [ ] Acknowledge a ticket as an agent. In the SQL Editor: `select kind, status, attempts from public.notification_outbox order by id desc limit 5;` shows `ticket_acknowledged | pending | 0`. (Nothing is sent: no provider is connected yet.)
- [ ] Post an internal note: no new outbox row for the requester. Post a public reply: a `staff_reply` row appears.
- [ ] In the app (not the SQL editor) the outbox is invisible: you cannot read it. (Optional check with the publishable key via a REST call: it must be rejected.)
- [ ] Rate limit: `update public.rate_limits set max_count = 2 where action = 'create_ticket';` then create three tickets quickly as one requester: the third shows "You're doing that too often..." and the draft stays on the phone. Restore with `update public.rate_limits set max_count = 20 where action = 'create_ticket';`.
- [ ] Logs: put the phone in airplane mode and try to send a ticket. In the Expo terminal you should see a JSON line with `"event":"repo_failed"`, `"op":"createTicket"`, `"kind":"network"` and a `clientRequestId`, and **no** ticket text, email or token. Same idea in the browser console for the portal.
- [ ] Do the restore drill in `docs/operations.md` section 5 on a throwaway project and write down the timings.

## 10. Phase 7 checks (pipelines and environments)

These need a GitHub repository, a Cloudflare account and a Supabase UAT project (`docs/environments.md`, `docs/release-runbook.md` section 8).

- [ ] Push the repository to GitHub. The **CI** workflow runs three jobs; `Checks` and `Dependency audit` should pass. The **Supabase local stack** job is the first run on a real Supabase stack: if it fails, send me the failing step's log (it may be the seed or a pgTAP expectation).
- [ ] Add the UAT variables and secrets, create the Cloudflare Pages project, tag a release candidate (for example `v0.1.0-rc1`), create its record from `docs/releases/TEMPLATE.md`, then run **Deploy** for `uat`. The smoke job must pass.
- [ ] Open the UAT site: a yellow "UAT environment: test data only" banner is visible; sign in works; the browser console shows no Content-Security-Policy errors.
- [ ] Build the UAT Android app (`docs/mobile-distribution.md`): it installs next to Expo Go, is named "Blaze (UAT)" and shows the UAT banner on the sign-in screen.
- [ ] Try the gate on purpose: run **Deploy** for `staging` before filling in the UAT lines of the record: it must refuse and say which lines are missing.

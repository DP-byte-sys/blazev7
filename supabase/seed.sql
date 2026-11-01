-- SYNTHETIC DEV/TEST DATA ONLY. Never run against production.
-- These users cannot sign in (no passwords). Create login-capable test users via Supabase Auth in Phase 3.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'requester1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'requester2@example.test'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'agent.network@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'agent.it@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'supervisor@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@example.test'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'agent.inactive@example.test');

update public.profiles set role = 'agent' where id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
update public.profiles set role = 'supervisor' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
update public.profiles set role = 'admin' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
update public.profiles set active = false where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

insert into public.teams (name) values ('Network'), ('IT Support');

insert into public.team_members (team_id, user_id)
select t.id, u.id from (values
  ('Network', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  ('Network', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid),
  ('IT Support', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  ('Network', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid),
  ('IT Support', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid)
) as u2(team_name, id) join public.teams t on t.name = u2.team_name
join (select id from auth.users) u on u.id = u2.id;

insert into public.ticket_categories (name, description, sort_order, default_team_id)
select c.name, c.description, c.sort_order, t.id from (values
  ('Network', 'Wi-Fi, VPN and connectivity', 1, 'Network'),
  ('Hardware', 'Laptops, monitors, peripherals', 2, 'IT Support'),
  ('Accounts', 'Passwords and access', 3, 'IT Support'),
  ('Software', 'Installs and application issues', 4, 'IT Support')
) as c(name, description, sort_order, team_name) join public.teams t on t.name = c.team_name;

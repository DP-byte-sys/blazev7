-- pgTAP tests run by `supabase test db` against a REAL local Supabase stack (see .github/workflows/ci.yml).
-- Everything happens inside one transaction that is rolled back at the end, so no test data is left behind.
-- Impersonation helper: runs ONE statement as a given role/user and returns its single value as text,
-- 'denied' when the database refuses (insufficient_privilege), or 'error:<sqlstate>:<message>' for anything else.
begin;

create function public.pgtap_as(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
    reset role;
    return coalesce(v, 'null');
  exception
    when insufficient_privilege then reset role; return 'denied';
    when others then reset role; return 'error:' || sqlstate || ':' || sqlerrm;
  end;
end $$;

select plan(15);

-- fixtures (different ids/emails from supabase/seed.sql so both can coexist)
insert into auth.users (id, email) values
  ('91111111-1111-1111-1111-111111111111', 'pgtap.requester1@example.test'),
  ('92222222-2222-2222-2222-222222222222', 'pgtap.requester2@example.test'),
  ('9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pgtap.agent@example.test');
update public.profiles set role = 'agent' where id = '9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.teams (id, name) values ('90000000-0000-0000-0000-000000000001', 'pgTAP team');
insert into public.team_members (team_id, user_id) values ('90000000-0000-0000-0000-000000000001', '9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.ticket_categories (id, name, default_team_id)
  values ('90000000-0000-0000-0000-0000000000c1', 'pgTAP category', '90000000-0000-0000-0000-000000000001');

-- 1-2 structure
select is((select role::text from public.profiles where id = '91111111-1111-1111-1111-111111111111'), 'requester', 'a new account always starts as requester');
select is((select count(*)::text from pg_tables where schemaname = 'public' and not rowsecurity), '0', 'every table in public has row level security enabled');

-- 3-4 anonymous users get nothing
select is(public.pgtap_as(null, 'anon', 'select count(*)::text from public.tickets'), 'denied', 'anonymous cannot read tickets');
select is(public.pgtap_as(null, 'anon', $q$select (public.create_ticket(gen_random_uuid(), '90000000-0000-0000-0000-0000000000c1', 't', 'd')).reference$q$), 'denied', 'anonymous cannot create tickets');

-- 5-7 requesters create and see only their own tickets
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', $q$select left((public.create_ticket(gen_random_uuid(), '90000000-0000-0000-0000-0000000000c1', 'Smoke', 'Smoke body')).reference, 4)$q$), 'BLZ-', 'a requester can create a ticket');
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*)::text from public.tickets'), '1', 'the requester sees their own ticket');
select is(public.pgtap_as('92222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*)::text from public.tickets'), '0', 'another requester sees nothing');

-- 8 no role escalation
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', $q$update public.profiles set role = 'admin' where id = '91111111-1111-1111-1111-111111111111' returning id::text$q$), 'denied', 'a requester cannot make themselves admin');

-- 9-10, 14 internal tables are invisible to API users
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*)::text from public.notification_outbox'), 'denied', 'API users cannot read the notification outbox');
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*)::text from public.claim_notifications(5)'), 'denied', 'API users cannot call the notification worker functions');
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*)::text from public.rate_limits'), 'denied', 'API users cannot read or change rate limits');

-- 11-13 staff scope and actions
select is(public.pgtap_as('9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'select count(*)::text from public.tickets'), '1', 'an agent sees the ticket in their team queue');
select is(public.pgtap_as('91111111-1111-1111-1111-111111111111', 'authenticated', $q$select (public.acknowledge_ticket((select id from public.tickets limit 1), 1)).status::text$q$), 'denied', 'a requester cannot acknowledge a ticket');
select is(public.pgtap_as('9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', $q$select (public.acknowledge_ticket((select id from public.tickets limit 1), 1)).status::text$q$), 'acknowledged', 'an agent in the team can acknowledge it');

-- 15 the worker role can claim the notification that the acknowledgement created
select is(public.pgtap_as(null, 'service_role', 'select count(*)::text from public.claim_notifications(5)'), '1', 'the service role can claim the pending notification');

select * from finish();
rollback;

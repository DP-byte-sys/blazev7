import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { U, as, call, categoryId, createTicket, freshDb, teamId } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  await db.close();
});

const ids = async (uid: string | null, sql = 'select id from public.tickets') =>
  (await call<{ id: string }>(db, uid, sql)).map((r) => r.id);

describe('clean setup and profiles', () => {
  it('migrations + seed apply to an empty database', async () => {
    const r = await db.query<{ c: number }>('select count(*)::int as c from public.profiles');
    expect(r.rows[0]!.c).toBe(7);
  });

  it('new users always start as requester, ignoring client metadata', async () => {
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data)
      values ('99999999-9999-9999-9999-999999999999', 'sneaky@example.test', '{"role":"admin"}')`);
    const r = await db.query<{ role: string; display_name: string }>(
      `select role, display_name from public.profiles where id = '99999999-9999-9999-9999-999999999999'`,
    );
    expect(r.rows[0]).toEqual({ role: 'requester', display_name: 'sneaky' });
  });
});

describe('no direct writes and no anonymous access', () => {
  it('anon cannot read tickets or call functions', async () => {
    await expect(call(db, null, 'select * from public.tickets')).rejects.toThrow(
      /permission denied/,
    );
    const cat = await categoryId(db, 'Network');
    await expect(
      call(db, null, `select * from public.create_ticket(gen_random_uuid(), $1, 't', 'd')`, [cat]),
    ).rejects.toThrow(/permission denied/);
  });

  it('authenticated users cannot insert/update/delete tables directly', async () => {
    const t = await createTicket(db, U.req1);
    const cat = await categoryId(db, 'Network');
    await expect(
      call(db, U.req1, `update public.tickets set status = 'resolved' where id = $1`, [t.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, U.req1, `delete from public.tickets where id = $1`, [t.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(
        db,
        U.req1,
        `insert into public.tickets (requester_id, category_id, title, description, client_request_id)
      values ($1, $2, 'x', 'y', gen_random_uuid())`,
        [U.req1, cat],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, U.agentNet, `update public.tickets set assignee_id = $1 where id = $2`, [
        U.agentNet,
        t.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('role escalation through direct profile update is blocked', async () => {
    await expect(
      call(db, U.req1, `update public.profiles set role = 'admin' where id = $1`, [U.req1]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, U.req1, `insert into public.team_members (team_id, user_id) values ($1, $2)`, [
        await teamId(db, 'Network'),
        U.req1,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('creating tickets', () => {
  it('creates a ticket with a reference, new status, routed team and a created event', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    expect(t.reference).toMatch(/^BLZ-\d{6}$/);
    expect(t.status).toBe('new');
    expect(t.team_id).toBe(await teamId(db, 'Network'));
    const ev = await db.query<{ event_type: string }>(
      'select event_type from public.ticket_events where ticket_id = $1',
      [t.id],
    );
    expect(ev.rows.map((e) => e.event_type)).toEqual(['ticket_created']);
  });

  it('retrying with the same client_request_id does not create a duplicate', async () => {
    const cat = await categoryId(db, 'Hardware');
    const key = 'aaaaaaaa-0000-4000-8000-000000000001';
    const run = () =>
      call<{ id: string }>(
        db,
        U.req1,
        `select * from public.create_ticket($1, $2, 'Dup test', 'body')`,
        [key, cat],
      );
    const [a] = await run();
    const [b] = await run();
    expect(a!.id).toBe(b!.id);
    const c = await db.query<{ c: number }>(
      'select count(*)::int as c from public.tickets where client_request_id = $1',
      [key],
    );
    expect(c.rows[0]!.c).toBe(1);
    const ev = await db.query<{ c: number }>(
      `select count(*)::int as c from public.ticket_events where ticket_id = $1`,
      [a!.id],
    );
    expect(ev.rows[0]!.c).toBe(1);
  });

  it('reusing a request key with different content is rejected, not silently ignored', async () => {
    const cat = await categoryId(db, 'Hardware');
    const key = 'aaaaaaaa-0000-4000-8000-000000000002';
    await call(db, U.req1, `select * from public.create_ticket($1, $2, 'Original title', 'body')`, [
      key,
      cat,
    ]);
    await expect(
      call(db, U.req1, `select * from public.create_ticket($1, $2, 'Edited title', 'body')`, [
        key,
        cat,
      ]),
    ).rejects.toThrow(/idempotency_conflict/);
    await expect(
      call(
        db,
        U.req1,
        `select * from public.create_ticket($1, $2, 'Original title', 'body', 'urgent')`,
        [key, cat],
      ),
    ).rejects.toThrow(/idempotency_conflict/);
    const same = await call<{ title: string }>(
      db,
      U.req1,
      `select * from public.create_ticket($1, $2, '  Original title ', 'body')`,
      [key, cat],
    );
    expect(same[0]!.title).toBe('Original title');
    const c = await db.query<{ c: number }>(
      'select count(*)::int as c from public.tickets where client_request_id = $1',
      [key],
    );
    expect(c.rows[0]!.c).toBe(1);
  });

  it('the same key used by different users never collides or leaks another ticket', async () => {
    const cat = await categoryId(db, 'Hardware');
    const key = 'aaaaaaaa-0000-4000-8000-000000000003';
    const [a] = await call<{ id: string }>(
      db,
      U.req1,
      `select * from public.create_ticket($1, $2, 'Mine', 'body')`,
      [key, cat],
    );
    const [b] = await call<{ id: string }>(
      db,
      U.req2,
      `select * from public.create_ticket($1, $2, 'Theirs', 'body')`,
      [key, cat],
    );
    expect(a!.id).not.toBe(b!.id);
  });

  it('requesters see public timeline events and public replies on their ticket only', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<{ version: number }>(
        db,
        U.agentNet,
        'select * from public.acknowledge_ticket($1, $2)',
        [t.id, t.version],
      )
    )[0]!;
    await call(db, U.agentNet, `select * from public.add_comment($1, 'We are on it', 'public')`, [
      t.id,
    ]);
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'internal only', 'internal')`,
      [t.id],
    );
    void a;
    const mine = await call<{ event_type: string }>(
      db,
      U.req1,
      'select event_type from public.ticket_events where ticket_id = $1 order by id',
      [t.id],
    );
    expect(mine.map((e) => e.event_type)).toEqual([
      'ticket_created',
      'acknowledged',
      'comment_added',
    ]);
    const other = await call(
      db,
      U.req2,
      'select * from public.ticket_events where ticket_id = $1',
      [t.id],
    );
    expect(other).toHaveLength(0);
    expect(
      await call(db, U.req2, 'select * from public.ticket_comments where ticket_id = $1', [t.id]),
    ).toHaveLength(0);
  });

  it('rejects invalid input and inactive categories', async () => {
    const cat = await categoryId(db, 'Software');
    await expect(
      call(db, U.req1, `select * from public.create_ticket(gen_random_uuid(), $1, '   ', 'body')`, [
        cat,
      ]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(db, U.req1, `select * from public.create_ticket(gen_random_uuid(), $1, 'title', '')`, [
        cat,
      ]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(
        db,
        U.req1,
        `select * from public.create_ticket(gen_random_uuid(), gen_random_uuid(), 'title', 'body')`,
      ),
    ).rejects.toThrow(/invalid_input/);
    await call(
      db,
      U.admin,
      `select * from public.admin_upsert_category($1, 'Software', null, false, 4, null)`,
      [cat],
    );
    await expect(
      call(
        db,
        U.req1,
        `select * from public.create_ticket(gen_random_uuid(), $1, 'title', 'body')`,
        [cat],
      ),
    ).rejects.toThrow(/invalid_input/);
    await call(
      db,
      U.admin,
      `select * from public.admin_upsert_category($1, 'Software', null, true, 4, null)`,
      [cat],
    );
  });

  it('inactive users cannot create tickets', async () => {
    await call(db, U.admin, `select * from public.admin_set_user_active($1, false)`, [U.req2]);
    const cat = await categoryId(db, 'Network');
    await expect(
      call(db, U.req2, `select * from public.create_ticket(gen_random_uuid(), $1, 't', 'b')`, [
        cat,
      ]),
    ).rejects.toThrow(/forbidden/);
    expect(await ids(U.req2)).toEqual([]);
    await call(db, U.admin, `select * from public.admin_set_user_active($1, true)`, [U.req2]);
  });
});

describe('visibility (RLS)', () => {
  it('requesters see only their own tickets', async () => {
    const t1 = await createTicket(db, U.req1);
    const t2 = await createTicket(db, U.req2);
    const seen1 = await ids(U.req1);
    const seen2 = await ids(U.req2);
    expect(seen1).toContain(t1.id);
    expect(seen1).not.toContain(t2.id);
    expect(seen2).toContain(t2.id);
    expect(seen2).not.toContain(t1.id);
  });

  it('agents see their team queue only; other teams are hidden', async () => {
    const net = await createTicket(db, U.req1, 'Network');
    const hw = await createTicket(db, U.req1, 'Hardware');
    const seenNet = await ids(U.agentNet);
    expect(seenNet).toContain(net.id);
    expect(seenNet).not.toContain(hw.id);
    const seenIt = await ids(U.agentIt);
    expect(seenIt).toContain(hw.id);
    expect(seenIt).not.toContain(net.id);
  });

  it('supervisor sees both teams; admin sees all', async () => {
    const net = await createTicket(db, U.req1, 'Network');
    const hw = await createTicket(db, U.req1, 'Hardware');
    for (const uid of [U.supervisor, U.admin]) {
      const seen = await ids(uid);
      expect(seen).toContain(net.id);
      expect(seen).toContain(hw.id);
    }
  });

  it('an assigned agent keeps access after leaving the team; unrelated requesters never gain it', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const assigned = await call<{ version: number }>(
      db,
      U.supervisor,
      `select * from public.assign_ticket($1, $2, $3)`,
      [t.id, U.agentNet, t.version],
    );
    expect(assigned[0]!.version).toBe(2);
    await call(db, U.admin, `select public.admin_set_team_member($1, $2, false)`, [
      await teamId(db, 'Network'),
      U.agentNet,
    ]);
    expect(await ids(U.agentNet)).toContain(t.id);
    await call(db, U.admin, `select public.admin_set_team_member($1, $2, true)`, [
      await teamId(db, 'Network'),
      U.agentNet,
    ]);
  });

  it('deactivated staff see nothing', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(db, U.admin, `select * from public.admin_set_user_active($1, false)`, [U.agentNet]);
    expect(await ids(U.agentNet)).not.toContain(t.id);
    await call(db, U.admin, `select * from public.admin_set_user_active($1, true)`, [U.agentNet]);
  });
});

describe('comments: public vs internal', () => {
  it('internal notes and their events are hidden from the requester', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'Staff-only note', 'internal')`,
      [t.id],
    );
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'Hello requester', 'public')`,
      [t.id],
    );
    const reqView = await call<{ body: string }>(
      db,
      U.req1,
      'select body from public.ticket_comments where ticket_id = $1',
      [t.id],
    );
    expect(reqView.map((c) => c.body)).toEqual(['Hello requester']);
    const staffView = await call<{ body: string }>(
      db,
      U.agentNet,
      'select body from public.ticket_comments where ticket_id = $1 order by created_at, id',
      [t.id],
    );
    expect(staffView.map((c) => c.body).sort()).toEqual(['Hello requester', 'Staff-only note']);
    const reqEvents = await call<{ event_type: string }>(
      db,
      U.req1,
      `select event_type from public.ticket_events where ticket_id = $1 and event_type = 'comment_added'`,
      [t.id],
    );
    expect(reqEvents).toHaveLength(1);
  });

  it("requesters cannot post internal notes or comment on others' tickets", async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await expect(
      call(db, U.req1, `select * from public.add_comment($1, 'sneaky', 'internal')`, [t.id]),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.req2, `select * from public.add_comment($1, 'not mine', 'public')`, [t.id]),
    ).rejects.toThrow(/ticket_not_found/);
    await expect(
      call(db, U.agentIt, `select * from public.add_comment($1, 'wrong team', 'public')`, [t.id]),
    ).rejects.toThrow(/ticket_not_found/);
  });

  it('a staff member who is the requester does not see internal notes on their own ticket', async () => {
    const cat = await categoryId(db, 'Hardware'); // IT Support ticket raised by the Network agent
    const [t] = await call<{ id: string }>(
      db,
      U.agentNet,
      `select * from public.create_ticket(gen_random_uuid(), $1, 'My laptop', 'broken')`,
      [cat],
    );
    await call(
      db,
      U.agentIt,
      `select * from public.add_comment($1, 'internal remark', 'internal')`,
      [t!.id],
    );
    const seen = await call(
      db,
      U.agentNet,
      'select * from public.ticket_comments where ticket_id = $1',
      [t!.id],
    );
    expect(seen).toHaveLength(0);
  });

  it('requester and staff can have a back-and-forth (public only), and only they can see it', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'Have you tried restarting?', 'public')`,
      [t.id],
    );
    await call(db, U.req1, `select * from public.add_comment($1, 'Yes, still failing', 'public')`, [
      t.id,
    ]);
    await expect(
      call(db, U.req1, `select * from public.add_comment($1, 'secret to staff', 'internal')`, [
        t.id,
      ]),
    ).rejects.toThrow(/forbidden/);
    const theirView = await call<{ body: string; author_id: string }>(
      db,
      U.req1,
      'select body, author_id from public.ticket_comments where ticket_id = $1 order by created_at, id',
      [t.id],
    );
    expect(theirView.map((c) => c.body)).toEqual([
      'Have you tried restarting?',
      'Yes, still failing',
    ]);
    const staffView = await call<{ body: string; author_id: string }>(
      db,
      U.agentNet,
      'select body, author_id from public.ticket_comments where ticket_id = $1 order by created_at, id',
      [t.id],
    );
    expect(staffView.find((c) => c.body === 'Yes, still failing')!.author_id).toBe(U.req1);
    expect(
      await call(db, U.req2, 'select * from public.ticket_comments where ticket_id = $1', [t.id]),
    ).toHaveLength(0);
    await expect(
      call(db, U.req2, `select * from public.add_comment($1, 'not my ticket', 'public')`, [t.id]),
    ).rejects.toThrow(/ticket_not_found/);
  });

  it('comments are append-only, even for the table owner', async () => {
    await expect(db.exec(`update public.ticket_comments set body = 'edited'`)).rejects.toThrow(
      /append_only/,
    );
    await expect(db.exec(`delete from public.ticket_comments`)).rejects.toThrow(/append_only/);
  });
});

describe('lifecycle', () => {
  it('walks the full happy path with audit events in order', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const ack = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        t.version,
      ])
    )[0]!;
    const wip = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        ack.version,
      ])
    )[0]!;
    const done = (
      await call<Ticket>(
        db,
        U.agentNet,
        `select * from public.resolve_ticket($1, 'Rebooted the access point', $2)`,
        [t.id, wip.version],
      )
    )[0]!;
    expect(done.status).toBe('resolved');
    const re = (
      await call<Ticket>(
        db,
        U.req1,
        `select * from public.reopen_ticket($1, 'Still failing', $2)`,
        [t.id, done.version],
      )
    )[0]!;
    expect(re.status).toBe('reopened');
    const back = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        re.version,
      ])
    )[0]!;
    expect(back.status).toBe('in_progress');
    const ev = await db.query<{ event_type: string; actor_id: string }>(
      'select event_type, actor_id from public.ticket_events where ticket_id = $1 order by id',
      [t.id],
    );
    expect(ev.rows.map((e) => e.event_type)).toEqual([
      'ticket_created',
      'acknowledged',
      'work_started',
      'resolved',
      'reopened',
      'work_started',
    ]);
    expect(ev.rows[4]!.actor_id).toBe(U.req1);
    expect(ev.rows[1]!.actor_id).toBe(U.agentNet);
  });

  it('rejects invalid transitions', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await expect(
      call(db, U.agentNet, `select * from public.resolve_ticket($1, 'done', $2)`, [
        t.id,
        t.version,
      ]),
    ).rejects.toThrow(/invalid_transition/);
    await expect(
      call(db, U.agentNet, 'select * from public.start_work($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/invalid_transition/);
    await expect(
      call(db, U.req1, `select * from public.reopen_ticket($1, 'why not', $2)`, [t.id, t.version]),
    ).rejects.toThrow(/invalid_transition/);
  });

  it('resolve requires a summary and reopen requires a reason', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        t.version,
      ])
    )[0]!;
    const w = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        a.version,
      ])
    )[0]!;
    await expect(
      call(db, U.agentNet, `select * from public.resolve_ticket($1, '   ', $2)`, [t.id, w.version]),
    ).rejects.toThrow(/summary/);
    const r = (
      await call<Ticket>(db, U.agentNet, `select * from public.resolve_ticket($1, 'Fixed', $2)`, [
        t.id,
        w.version,
      ])
    )[0]!;
    await expect(
      call(db, U.req1, `select * from public.reopen_ticket($1, '', $2)`, [t.id, r.version]),
    ).rejects.toThrow(/reason/);
  });

  it('stale concurrent updates fail instead of overwriting', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
      t.id,
      t.version,
    ]);
    await expect(
      call(db, U.supervisor, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/stale_version/);
  });

  it('only in-scope staff can act; requesters and other teams cannot', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await expect(
      call(db, U.req1, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.req2, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/ticket_not_found/);
    await expect(
      call(db, U.agentIt, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/ticket_not_found/);
    await expect(
      call(db, null, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/permission denied/);
  });

  it("another requester cannot reopen someone else's ticket", async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        t.version,
      ])
    )[0]!;
    const w = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        a.version,
      ])
    )[0]!;
    const r = (
      await call<Ticket>(db, U.agentNet, `select * from public.resolve_ticket($1, 'ok', $2)`, [
        t.id,
        w.version,
      ])
    )[0]!;
    await expect(
      call(db, U.req2, `select * from public.reopen_ticket($1, 'mine now', $2)`, [t.id, r.version]),
    ).rejects.toThrow(/ticket_not_found/);
  });
});

describe('assignment', () => {
  it('assigns, reassigns, and records the right events', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<Ticket>(db, U.agentNet, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        U.agentNet,
        t.version,
      ])
    )[0]!;
    expect(a.assignee_id).toBe(U.agentNet);
    const b = (
      await call<Ticket>(
        db,
        U.agentNet,
        `select * from public.assign_ticket($1, $2, $3, 'covering')`,
        [t.id, U.supervisor, a.version],
      )
    )[0]!;
    expect(b.assignee_id).toBe(U.supervisor);
    const ev = await db.query<{ event_type: string; reason: string | null }>(
      `select event_type, reason from public.ticket_events where ticket_id = $1 and event_type in ('assigned','reassigned') order by id`,
      [t.id],
    );
    expect(ev.rows).toEqual([
      { event_type: 'assigned', reason: null },
      { event_type: 'reassigned', reason: 'covering' },
    ]);
  });

  it('rejects ineligible assignees (requester, inactive, other team, admin)', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const bad = (uid: string) =>
      call(db, U.supervisor, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        uid,
        t.version,
      ]);
    await expect(bad(U.req2)).rejects.toThrow(/assignee must be/);
    await expect(bad(U.inactiveAgent)).rejects.toThrow(/assignee must be/);
    await expect(bad(U.agentIt)).rejects.toThrow(/not in the ticket team/);
    await expect(bad(U.admin)).rejects.toThrow(/assignee must be/);
  });

  it('requesters and out-of-scope agents cannot assign', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await expect(
      call(db, U.req1, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        U.agentNet,
        t.version,
      ]),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.agentIt, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        U.agentNet,
        t.version,
      ]),
    ).rejects.toThrow(/ticket_not_found/);
  });
});

describe('assignment details stay internal', () => {
  it('requesters cannot see assignment events or their reasons; staff can', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(
      db,
      U.agentNet,
      `select * from public.assign_ticket($1, $2, $3, 'agent is on leave next week')`,
      [t.id, U.agentNet, t.version],
    );
    const reqView = await call<{ event_type: string; reason: string | null }>(
      db,
      U.req1,
      'select event_type, reason from public.ticket_events where ticket_id = $1',
      [t.id],
    );
    expect(reqView.map((e) => e.event_type)).toEqual(['ticket_created']);
    expect(JSON.stringify(reqView)).not.toContain('on leave');
    const staffView = await call<{ event_type: string }>(
      db,
      U.agentNet,
      `select event_type from public.ticket_events where ticket_id = $1 and event_type = 'assigned'`,
      [t.id],
    );
    expect(staffView).toHaveLength(1);
  });
});

describe('audit history integrity', () => {
  it('ticket events cannot be edited or deleted by API users or the owner', async () => {
    const t = await createTicket(db, U.req1);
    await expect(
      call(db, U.agentNet, `update public.ticket_events set reason = 'x' where ticket_id = $1`, [
        t.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, U.admin, `delete from public.ticket_events where ticket_id = $1`, [t.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.exec(`update public.ticket_events set reason = 'x'`)).rejects.toThrow(
      /append_only/,
    );
    await expect(db.exec(`delete from public.ticket_events`)).rejects.toThrow(/append_only/);
  });
});

describe('administration', () => {
  it('only admins can change roles; users cannot self-escalate', async () => {
    await expect(
      call(db, U.req1, `select * from public.admin_set_user_role($1, 'admin')`, [U.req1]),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.agentNet, `select * from public.admin_set_user_role($1, 'supervisor')`, [
        U.agentNet,
      ]),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.supervisor, `select * from public.admin_set_user_role($1, 'admin')`, [U.req1]),
    ).rejects.toThrow(/forbidden/);
    const r = await db.query<{ role: string }>('select role from public.profiles where id = $1', [
      U.req1,
    ]);
    expect(r.rows[0]!.role).toBe('requester');
  });

  it('admins can change roles (audited) but not their own', async () => {
    await call(db, U.admin, `select * from public.admin_set_user_role($1, 'agent')`, [U.req2]);
    const audit = await call<{
      action: string;
      actor_id: string;
      old_value: { role: string };
      new_value: { role: string };
    }>(
      db,
      U.admin,
      `select * from public.admin_audit_events where action = 'user_role_changed' and target_id = $1`,
      [U.req2],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_id).toBe(U.admin);
    expect(audit[0]!.old_value.role).toBe('requester');
    expect(audit[0]!.new_value.role).toBe('agent');
    await call(db, U.admin, `select * from public.admin_set_user_role($1, 'requester')`, [U.req2]);
    await expect(
      call(db, U.admin, `select * from public.admin_set_user_role($1, 'requester')`, [U.admin]),
    ).rejects.toThrow(/own role/);
  });

  it('the admin audit log is readable by admins only', async () => {
    expect(
      (await call(db, U.admin, 'select * from public.admin_audit_events')).length,
    ).toBeGreaterThan(0);
    for (const uid of [U.req1, U.agentNet, U.supervisor]) {
      expect(await call(db, uid, 'select * from public.admin_audit_events')).toHaveLength(0);
    }
  });

  it('only admins can manage categories and teams', async () => {
    await expect(
      call(
        db,
        U.supervisor,
        `select * from public.admin_upsert_category(null, 'Sneaky', null, true, 9, null)`,
      ),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(db, U.agentNet, `select public.admin_set_team_member($1, $2, true)`, [
        await teamId(db, 'Network'),
        U.agentNet,
      ]),
    ).rejects.toThrow(/forbidden/);
    const c = await call<{ id: string }>(
      db,
      U.admin,
      `select * from public.admin_upsert_category(null, 'Facilities', 'Desks and rooms', true, 9, null)`,
    );
    expect(c).toHaveLength(1);
  });

  it('only active agents/supervisors can join teams', async () => {
    await expect(
      call(db, U.admin, `select public.admin_set_team_member($1, $2, true)`, [
        await teamId(db, 'Network'),
        U.req1,
      ]),
    ).rejects.toThrow(/only active agents/);
  });

  it('users can update only their own display name, and see only allowed profiles', async () => {
    await call(db, U.req1, `select * from public.update_own_profile('Requester One')`);
    const me = await call<{ display_name: string }>(
      db,
      U.req1,
      'select display_name from public.profiles',
    );
    expect(me).toEqual([{ display_name: 'Requester One' }]);
    expect((await call(db, U.supervisor, 'select * from public.profiles')).length).toBeGreaterThan(
      5,
    );
  });

  it('requesters cannot read teams or team membership of others', async () => {
    expect(await call(db, U.req1, 'select * from public.teams')).toHaveLength(0);
    expect(await call(db, U.req1, 'select * from public.team_members')).toHaveLength(0);
  });
});

describe('function privileges', () => {
  it('internal private functions are not callable by API users', async () => {
    const t = await createTicket(db, U.req1);
    await expect(
      call(db, U.req1, `select private.add_event($1, 'acknowledged', null, null, null, true)`, [
        t.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      call(db, U.agentNet, `select * from private.lock_ticket($1, 1)`, [t.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(call(db, U.admin, `select private.require_admin()`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

type Ticket = { id: string; version: number; status: string; assignee_id: string | null };
void as;

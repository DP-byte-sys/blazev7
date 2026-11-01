import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { U, call, createTicket, freshDb, teamId } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  await db.close();
});

// What the staff web portal reads to render queues, assignment lists and audit names.
describe('staff portal reads', () => {
  it('staff can read profiles (requester and actor names); requesters cannot read staff profiles', async () => {
    const staffView = await call<{ id: string }>(db, U.agentNet, 'select id from public.profiles');
    const ids = staffView.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([U.req1, U.req2, U.supervisor, U.admin]));
    const requesterView = await call<{ id: string }>(db, U.req1, 'select id from public.profiles');
    expect(requesterView.map((p) => p.id)).toEqual([U.req1]);
  });

  it('staff can list team members for the assignee picker; requesters cannot', async () => {
    const net = await teamId(db, 'Network');
    const members = await call<{ user_id: string }>(
      db,
      U.agentNet,
      'select user_id from public.team_members where team_id = $1',
      [net],
    );
    expect(members.map((m) => m.user_id)).toEqual(
      expect.arrayContaining([U.agentNet, U.supervisor]),
    );
    expect(
      await call(db, U.req1, 'select * from public.team_members where team_id = $1', [net]),
    ).toHaveLength(0);
  });

  it('staff see inactive categories (for administration); requesters only active ones', async () => {
    await call(
      db,
      U.admin,
      `select * from public.admin_upsert_category(null, 'Retired', null, false, 99, null)`,
    );
    const staff = await call<{ name: string }>(
      db,
      U.supervisor,
      'select name from public.ticket_categories',
    );
    expect(staff.map((c) => c.name)).toContain('Retired');
    const req = await call<{ name: string }>(
      db,
      U.req1,
      'select name from public.ticket_categories',
    );
    expect(req.map((c) => c.name)).not.toContain('Retired');
  });

  it('staff see internal notes and internal events on tickets in scope; requesters never do', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'internal remark', 'internal')`,
      [t.id],
    );
    const staffComments = await call<{ visibility: string }>(
      db,
      U.supervisor,
      'select visibility from public.ticket_comments where ticket_id = $1',
      [t.id],
    );
    expect(staffComments.map((c) => c.visibility)).toEqual(['internal']);
    const staffEvents = await call<{ visible_to_requester: boolean }>(
      db,
      U.supervisor,
      `select visible_to_requester from public.ticket_events where ticket_id = $1 and event_type = 'comment_added'`,
      [t.id],
    );
    expect(staffEvents.map((e) => e.visible_to_requester)).toEqual([false]);
    expect(
      await call(db, U.req1, 'select * from public.ticket_comments where ticket_id = $1', [t.id]),
    ).toHaveLength(0);
    expect(
      await call(
        db,
        U.req1,
        `select * from public.ticket_events where ticket_id = $1 and event_type = 'comment_added'`,
        [t.id],
      ),
    ).toHaveLength(0);
  });

  it('an agent from another team cannot read the ticket, its notes or its events', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await call(db, U.agentNet, `select * from public.add_comment($1, 'note', 'internal')`, [t.id]);
    for (const table of ['tickets', 'ticket_comments', 'ticket_events']) {
      const col = table === 'tickets' ? 'id' : 'ticket_id';
      expect(
        await call(db, U.agentIt, `select * from public.${table} where ${col} = $1`, [t.id]),
      ).toHaveLength(0);
    }
  });
});

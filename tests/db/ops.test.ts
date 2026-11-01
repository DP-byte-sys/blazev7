import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { U, call, categoryId, createTicket, freshDb, type Ticket } from './harness';

interface Outbox {
  id: number;
  recipient_id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
}
const outbox = async (db: PGlite, ticketId: string) =>
  (
    await db.query<Outbox>(
      'select * from public.notification_outbox where ticket_id = $1 order by id',
      [ticketId],
    )
  ).rows;
const kinds = (rows: Outbox[]) => rows.map((r) => `${r.kind}->${r.recipient_id}`);
const ver = async (db: PGlite, id: string) =>
  (await db.query<{ version: number }>('select version from public.tickets where id = $1', [id]))
    .rows[0]!.version;

describe('notification outbox', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it('stores no ticket text or names: only ids, kind and delivery bookkeeping', async () => {
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notification_outbox' order by column_name`,
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual([
      'attempts',
      'claimed_at',
      'created_at',
      'event_id',
      'id',
      'kind',
      'last_error',
      'next_attempt_at',
      'processed_at',
      'recipient_id',
      'status',
      'ticket_id',
    ]);
  });

  it('creating a ticket notifies nobody (no recipient is defined for it yet)', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    expect(await outbox(db, t.id)).toHaveLength(0);
  });

  it('notifies the requester about acknowledge, public replies and resolution, but not about internal notes', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        t.version,
      ])
    )[0]!;
    await call(db, U.agentNet, `select * from public.add_comment($1, 'On it', 'public')`, [t.id]);
    await call(
      db,
      U.agentNet,
      `select * from public.add_comment($1, 'secret staff note', 'internal')`,
      [t.id],
    );
    const w = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        a.version,
      ])
    )[0]!;
    await call(db, U.agentNet, `select * from public.resolve_ticket($1, 'Fixed', $2)`, [
      t.id,
      w.version,
    ]);
    expect(kinds(await outbox(db, t.id))).toEqual([
      `ticket_acknowledged->${U.req1}`,
      `staff_reply->${U.req1}`,
      `ticket_resolved->${U.req1}`,
    ]);
  });

  it('notifies the new assignee, but never the person who made the change', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const a = (
      await call<Ticket>(db, U.supervisor, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        U.agentNet,
        t.version,
      ])
    )[0]!;
    await call(db, U.agentNet, 'select * from public.assign_ticket($1, $2, $3)', [
      t.id,
      U.supervisor,
      a.version,
    ]); // reassigned back to the supervisor
    expect(kinds(await outbox(db, t.id))).toEqual([
      `assigned_to_you->${U.agentNet}`,
      `assigned_to_you->${U.supervisor}`,
    ]);
    const self = await createTicket(db, U.req1, 'Network');
    await call(db, U.agentNet, 'select * from public.assign_ticket($1, $2, $3)', [
      self.id,
      U.agentNet,
      self.version,
    ]); // self-assign
    expect(await outbox(db, self.id)).toHaveLength(0);
  });

  it('notifies the assignee when the requester replies or reopens', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const as1 = (
      await call<Ticket>(db, U.supervisor, 'select * from public.assign_ticket($1, $2, $3)', [
        t.id,
        U.agentNet,
        t.version,
      ])
    )[0]!;
    const ack = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        as1.version,
      ])
    )[0]!;
    const wip = (
      await call<Ticket>(db, U.agentNet, 'select * from public.start_work($1, $2)', [
        t.id,
        ack.version,
      ])
    )[0]!;
    const res = (
      await call<Ticket>(db, U.agentNet, `select * from public.resolve_ticket($1, 'Done', $2)`, [
        t.id,
        wip.version,
      ])
    )[0]!;
    await call(db, U.req1, `select * from public.add_comment($1, 'Still broken', 'public')`, [
      t.id,
    ]);
    await call(db, U.req1, `select * from public.reopen_ticket($1, 'Again', $2)`, [
      t.id,
      res.version,
    ]);
    const rows = kinds(await outbox(db, t.id));
    expect(rows).toContain(`requester_reply->${U.agentNet}`);
    expect(rows).toContain(`requester_reopened->${U.agentNet}`);
    expect(rows).toContain(`ticket_resolved->${U.req1}`);
    expect(rows.filter((r) => r.endsWith(U.req1) && r.startsWith('requester_'))).toEqual([]); // the requester is never told about their own actions
  });

  it('a failed action leaves no notification behind (same transaction as the event)', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await expect(
      call(db, U.agentIt, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
    ).rejects.toThrow(/ticket_not_found/);
    await expect(
      call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [t.id, 99]),
    ).rejects.toThrow(/stale_version/);
    expect(await outbox(db, t.id)).toHaveLength(0);
  });

  it('API users cannot read the outbox or call the worker functions', async () => {
    for (const uid of [null, U.req1, U.agentNet, U.admin]) {
      await expect(call(db, uid, 'select * from public.notification_outbox')).rejects.toThrow(
        /permission denied/,
      );
      await expect(call(db, uid, 'select * from public.claim_notifications(5)')).rejects.toThrow(
        /permission denied/,
      );
      await expect(call(db, uid, 'select public.complete_notification(1)')).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

describe('notification worker API (service role)', () => {
  let db: PGlite;
  let rowId: number;
  beforeAll(async () => {
    db = await freshDb();
    const t = await createTicket(db, U.req1, 'Network');
    await call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
      t.id,
      t.version,
    ]);
    rowId = (await outbox(db, t.id))[0]!.id;
  });
  afterAll(async () => {
    await db.close();
  });
  const claim = () => call<Outbox>(db, 'service', 'select * from public.claim_notifications(10)');
  const row = async () =>
    (await db.query<Outbox>('select * from public.notification_outbox where id = $1', [rowId]))
      .rows[0]!;

  it('claims a due row once (marks it processing, counts the attempt) and does not hand it out twice', async () => {
    const first = await claim();
    expect(first.map((r) => r.id)).toEqual([rowId]);
    expect(first[0]).toMatchObject({ status: 'processing', attempts: 1 });
    expect(await claim()).toHaveLength(0);
  });

  it('records a failure with backoff and only retries once it is due again', async () => {
    await call(db, 'service', `select public.fail_notification($1, 'smtp_timeout')`, [rowId]);
    const r = await row();
    expect(r).toMatchObject({ status: 'failed', attempts: 1, last_error: 'smtp_timeout' });
    expect(new Date(r.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await claim()).toHaveLength(0);
    await db.exec(
      `update public.notification_outbox set next_attempt_at = now() where id = ${rowId}`,
    );
    expect((await claim())[0]).toMatchObject({ attempts: 2 });
  });

  it('reclaims work stuck in "processing" after a worker crash', async () => {
    expect(await claim()).toHaveLength(0);
    await db.exec(
      `update public.notification_outbox set claimed_at = now() - interval '11 minutes' where id = ${rowId}`,
    );
    expect((await claim())[0]).toMatchObject({ attempts: 3 });
  });

  it('truncates stored error text and gives up (dead) after the maximum attempts', async () => {
    await call(db, 'service', `select public.fail_notification($1, $2, 3)`, [
      rowId,
      'x'.repeat(900),
    ]);
    const r = await row();
    expect(r.status).toBe('dead');
    expect(r.last_error).toHaveLength(500);
    await db.exec(
      `update public.notification_outbox set next_attempt_at = now() where id = ${rowId}`,
    );
    expect(await claim()).toHaveLength(0); // dead rows are never retried automatically
  });

  it('completes a claimed row', async () => {
    await db.exec(
      `update public.notification_outbox set status = 'pending', next_attempt_at = now() where id = ${rowId}`,
    );
    await claim();
    await call(db, 'service', 'select public.complete_notification($1)', [rowId]);
    expect(await row()).toMatchObject({ status: 'sent', last_error: null });
  });
});

describe('rate limits', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.close();
  });
  const setLimit = (action: string, max: number) =>
    db.exec(`update public.rate_limits set max_count = ${max} where action = '${action}'`);

  it('blocks ticket creation beyond the limit, per user, with a clear error code', async () => {
    await setLimit('create_ticket', 3);
    for (let i = 0; i < 3; i++) await createTicket(db, U.req1, 'Network', `Ticket ${i}`);
    const cat = await categoryId(db, 'Network');
    await expect(
      call(
        db,
        U.req1,
        `select * from public.create_ticket(gen_random_uuid(), $1, 'One too many', 'body')`,
        [cat],
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/rate_limited/), code: '54000' });
    await createTicket(db, U.req2, 'Network', 'Another user is unaffected');
  });

  it('never blocks the retry of a ticket that already exists (idempotent retry comes first)', async () => {
    const cat = await categoryId(db, 'Hardware');
    const key = 'bbbbbbbb-0000-4000-8000-000000000001';
    await setLimit('create_ticket', 100000);
    const [first] = await call<{ id: string }>(
      db,
      U.req2,
      `select * from public.create_ticket($1, $2, 'Retry me', 'body')`,
      [key, cat],
    );
    await setLimit('create_ticket', 1); // req2 is now over the limit
    const [again] = await call<{ id: string }>(
      db,
      U.req2,
      `select * from public.create_ticket($1, $2, 'Retry me', 'body')`,
      [key, cat],
    );
    expect(again!.id).toBe(first!.id);
    await expect(
      call(
        db,
        U.req2,
        `select * from public.create_ticket(gen_random_uuid(), $1, 'New one', 'body')`,
        [cat],
      ),
    ).rejects.toThrow(/rate_limited/);
  });

  it('the limit is a rolling window: old tickets stop counting', async () => {
    await setLimit('create_ticket', 3);
    await db.exec(
      `update public.tickets set created_at = now() - interval '2 hours' where requester_id = '${U.req1}'`,
    );
    await createTicket(db, U.req1, 'Network', 'Allowed again');
  });

  it('limits comments per author and leaves other authors alone', async () => {
    await setLimit('create_ticket', 100000);
    const t = await createTicket(db, U.req1, 'Network', 'Chatty');
    await setLimit('add_comment', 2);
    await call(db, U.agentNet, `select * from public.add_comment($1, 'one', 'public')`, [t.id]);
    await call(db, U.agentNet, `select * from public.add_comment($1, 'two', 'internal')`, [t.id]);
    await expect(
      call(db, U.agentNet, `select * from public.add_comment($1, 'three', 'public')`, [t.id]),
    ).rejects.toThrow(/rate_limited/);
    await call(
      db,
      U.req1,
      `select * from public.add_comment($1, 'requester can still reply', 'public')`,
      [t.id],
    );
  });

  it('the limits table cannot be read or changed by API users', async () => {
    await expect(call(db, U.admin, 'select * from public.rate_limits')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      call(db, U.admin, `update public.rate_limits set max_count = 1000000`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('failure handling', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it('rolls back the state change when writing the audit event fails (atomic)', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    await db.exec(`
      create function public.test_fail_event() returns trigger language plpgsql as $$ begin raise exception 'simulated_failure'; end $$;
      create trigger test_fail before insert on public.ticket_events for each row when (new.event_type = 'acknowledged') execute function public.test_fail_event();`);
    try {
      await expect(
        call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [t.id, t.version]),
      ).rejects.toThrow(/simulated_failure/);
      const row = (
        await db.query<{ status: string; version: number }>(
          'select status, version from public.tickets where id = $1',
          [t.id],
        )
      ).rows[0]!;
      expect(row).toEqual({ status: 'new', version: 1 });
      expect(
        (
          await db.query(
            'select 1 from public.ticket_events where ticket_id = $1 and event_type = $2',
            [t.id, 'acknowledged'],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await db.exec(
        'drop trigger test_fail on public.ticket_events; drop function public.test_fail_event();',
      );
    }
    await call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
      t.id,
      t.version,
    ]); // works again after the fault is gone
  });

  it('answers hostile or malformed input with typed errors, not internal ones', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    const cat = await categoryId(db, 'Network');
    const typed = /ticket_not_found|invalid_input|stale_version|forbidden|invalid_transition/;
    await expect(
      call(db, U.agentNet, 'select * from public.acknowledge_ticket(null, null)'),
    ).rejects.toThrow(typed);
    await expect(
      call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, -5)', [t.id]),
    ).rejects.toThrow(/stale_version/);
    await expect(
      call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, 2147483647)', [t.id]),
    ).rejects.toThrow(/stale_version/);
    await expect(
      call(db, U.agentNet, 'select * from public.add_comment(null, $1)', ['x']),
    ).rejects.toThrow(typed);
    await expect(
      call(db, U.agentNet, `select * from public.add_comment($1, null)`, [t.id]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(db, U.supervisor, 'select * from public.assign_ticket($1, null, $2)', [t.id, t.version]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(db, U.req1, `select * from public.create_ticket(gen_random_uuid(), $1, $2, 'ok')`, [
        cat,
        'x'.repeat(201),
      ]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(db, U.req1, `select * from public.create_ticket(gen_random_uuid(), $1, 'ok', $2)`, [
        cat,
        'x'.repeat(5001),
      ]),
    ).rejects.toThrow(/invalid_input/);
    await expect(
      call(db, U.req1, `select * from public.create_ticket(null, $1, 'ok', 'ok')`, [cat]),
    ).rejects.toThrow(/invalid_input/);
  });

  it('stores injection-looking text as plain data and leaves the tables intact', async () => {
    const cat = await categoryId(db, 'Network');
    const nasty = `'); drop table public.tickets; -- ${'\u202e'} 😀 <script>alert(1)</script>`;
    const [t] = await call<{ id: string; title: string }>(
      db,
      U.req1,
      `select * from public.create_ticket(gen_random_uuid(), $1, $2, $3)`,
      [cat, nasty, nasty],
    );
    expect(t!.title).toBe(nasty);
    await call(db, U.agentNet, `select * from public.add_comment($1, $2, 'public')`, [
      t!.id,
      nasty,
    ]);
    expect(
      (await db.query<{ c: number }>('select count(*)::int as c from public.tickets')).rows[0]!.c,
    ).toBeGreaterThan(0);
  });

  it('keeps working after rejected requests (no leaked locks or half-applied changes)', async () => {
    const t = await createTicket(db, U.req1, 'Network');
    for (let i = 0; i < 5; i++)
      await expect(
        call(db, U.agentNet, 'select * from public.acknowledge_ticket($1, 999)', [t.id]),
      ).rejects.toThrow(/stale_version/);
    const ok = (
      await call<Ticket>(db, U.agentNet, 'select * from public.acknowledge_ticket($1, $2)', [
        t.id,
        t.version,
      ])
    )[0]!;
    expect(ok.status).toBe('acknowledged');
    expect(await ver(db, t.id)).toBe(2);
  });
});

describe('basic load (3,000 tickets)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
    await db.exec(`
      insert into public.tickets (requester_id, category_id, team_id, title, description, status, client_request_id)
      select '${U.req1}'::uuid, c.id, c.default_team_id, 'Load ticket ' || g, 'load test', 'new', gen_random_uuid()
        from generate_series(1, 3000) g
        cross join lateral (select id, default_team_id from public.ticket_categories order by sort_order limit 1 offset (g % 4)) c;
      analyze public.tickets;`);
  });
  afterAll(async () => {
    await db.close();
  });

  const timed = async <T>(label: string, fn: () => Promise<T>) => {
    const t0 = performance.now();
    const r = await fn();
    const ms = Math.round(performance.now() - t0);
    console.log(`[load] ${label}: ${ms} ms`);
    return { r, ms };
  };
  const BUDGET_MS = 20_000; // generous: this runs in WebAssembly on any laptop or CI runner; it catches order-of-magnitude regressions only

  it('returns exactly the rows each role may see, within budget', async () => {
    const net = await timed('agent (Network team) count', () =>
      call<{ c: number }>(db, U.agentNet, 'select count(*)::int as c from public.tickets'),
    );
    const it = await timed('agent (IT Support) count', () =>
      call<{ c: number }>(db, U.agentIt, 'select count(*)::int as c from public.tickets'),
    );
    const req = await timed('requester count', () =>
      call<{ c: number }>(db, U.req1, 'select count(*)::int as c from public.tickets'),
    );
    const other = await timed('other requester count', () =>
      call<{ c: number }>(db, U.req2, 'select count(*)::int as c from public.tickets'),
    );
    expect([net.r[0]!.c, it.r[0]!.c, req.r[0]!.c, other.r[0]!.c]).toEqual([750, 2250, 3000, 0]);
    for (const m of [net.ms, it.ms, req.ms, other.ms]) expect(m).toBeLessThan(BUDGET_MS);
  });

  it('serves the staff queue query (latest 200) within budget', async () => {
    const q = await timed('queue query', () =>
      call<{ id: string }>(
        db,
        U.agentNet,
        'select id from public.tickets order by updated_at desc limit 200',
      ),
    );
    expect(q.r).toHaveLength(200);
    expect(q.ms).toBeLessThan(BUDGET_MS);
  });

  it('creates tickets one after another without slowing down noticeably', async () => {
    const cat = await categoryId(db, 'Network');
    const t = await timed('50 sequential create_ticket calls', async () => {
      for (let i = 0; i < 50; i++)
        await call(
          db,
          U.req2,
          `select * from public.create_ticket(gen_random_uuid(), $1, 'Seq ' || $2::text, 'body')`,
          [cat, i],
        );
    });
    expect(t.ms).toBeLessThan(BUDGET_MS);
    expect(
      (await call<{ c: number }>(db, U.req2, 'select count(*)::int as c from public.tickets'))[0]!
        .c,
    ).toBe(50);
  });
});

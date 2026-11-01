import { describe, expect, it, vi } from 'vitest';
import { classifyError } from './result';
import { AUDIT_LIMIT, QUEUE_LIMIT, createStaffRepository } from './staffRepository';

type Res = { data?: unknown; error?: unknown };
function fakeClient(tables: Record<string, Res>, rpc: Res = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const chain = (table: string): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, key: string) =>
        key === 'then'
          ? (res: (v: Res) => void) => res(tables[table] ?? { data: [] })
          : (...args: unknown[]) => {
              calls.push({ table, method: key, args });
              return p;
            },
    });
    return p;
  };
  const client = { from: vi.fn((t: string) => chain(t)), rpc: vi.fn(async () => rpc) };
  return { client: client as never, raw: client, calls };
}

const profiles = {
  data: [
    { id: 'u-req', display_name: 'Riley Requester', role: 'requester', active: true },
    { id: 'u-a1', display_name: 'Alex Agent', role: 'agent', active: true },
    { id: 'u-a2', display_name: 'Bo Agent', role: 'agent', active: true },
    { id: 'u-old', display_name: 'Old Agent', role: 'agent', active: false },
    { id: 'u-adm', display_name: 'Ada Admin', role: 'admin', active: true },
  ],
};

const ticketRow = {
  id: 't1',
  reference: 'BLZ-000001',
  requester_id: 'u-req',
  category_id: 'c1',
  team_id: 'tm1',
  title: 'Wi-Fi',
  description: 'd',
  priority: 'high',
  status: 'in_progress',
  assignee_id: 'u-a1',
  resolution_summary: null,
  version: 4,
  created_at: '2026-10-28T09:00:00Z',
  updated_at: '2026-10-29T09:00:00Z',
};

describe('staff repository reads', () => {
  it('maps the queue with names, category and team, newest first, limited', async () => {
    const { client, calls } = fakeClient({
      tickets: { data: [ticketRow] },
      profiles,
      ticket_categories: { data: [{ id: 'c1', name: 'Network' }] },
      teams: { data: [{ id: 'tm1', name: 'Net team' }] },
    });
    const r = await createStaffRepository(client).listQueue();
    expect(r).toMatchObject({
      ok: true,
      data: [
        {
          id: 't1',
          reference: 'BLZ-000001',
          category: 'Network',
          teamName: 'Net team',
          requesterName: 'Riley Requester',
          assigneeName: 'Alex Agent',
          assigneeId: 'u-a1',
          status: 'in_progress',
          updatedAt: '2026-10-29T09:00:00Z',
        },
      ],
    });
    expect(calls.find((c) => c.table === 'tickets' && c.method === 'limit')?.args).toEqual([
      QUEUE_LIMIT,
    ]);
    expect(calls.find((c) => c.table === 'tickets' && c.method === 'order')?.args).toEqual([
      'updated_at',
      { ascending: false },
    ]);
  });

  it('does not leak raw ids when a name cannot be found', async () => {
    const { client } = fakeClient({
      tickets: { data: [{ ...ticketRow, requester_id: 'ghost', assignee_id: 'ghost2' }] },
      profiles: { data: [] },
    });
    const r = await createStaffRepository(client).listQueue();
    expect(r).toMatchObject({
      ok: true,
      data: [{ requesterName: 'Unknown user', assigneeName: 'Unknown user' }],
    });
  });

  it('returns not_found when the ticket is not visible (RLS returns no row)', async () => {
    const { client } = fakeClient({ tickets: { data: null } });
    expect(await createStaffRepository(client).getTicket('x')).toMatchObject({
      ok: false,
      error: { kind: 'not_found' },
    });
  });

  it('maps a ticket with its version for optimistic concurrency', async () => {
    const { client } = fakeClient({ tickets: { data: ticketRow }, profiles });
    expect(await createStaffRepository(client).getTicket('t1')).toMatchObject({
      ok: true,
      data: { version: 4, teamId: 'tm1', requesterId: 'u-req', description: 'd' },
    });
  });

  it('marks events that the requester cannot see as internal', async () => {
    const { client } = fakeClient({
      ticket_events: {
        data: [
          {
            id: 1,
            actor_id: 'u-a1',
            event_type: 'assigned',
            old_value: null,
            new_value: { assignee_id: 'u-a2' },
            reason: null,
            visible_to_requester: false,
            created_at: 'c',
          },
        ],
      },
      ticket_comments: {
        data: [
          { id: 'k1', author_id: 'u-a1', body: 'note', visibility: 'internal', created_at: 'c' },
        ],
      },
      profiles,
    });
    const r = await createStaffRepository(client).getTimeline('t1');
    expect(r).toMatchObject({
      ok: true,
      data: {
        events: [{ internal: true, type: 'assigned' }],
        comments: [{ visibility: 'internal' }],
        names: { 'u-a1': 'Alex Agent' },
      },
    });
  });

  it('assignable agents: only active agents/supervisors in the ticket team', async () => {
    const { client } = fakeClient({
      profiles,
      team_members: {
        data: [
          { user_id: 'u-a1' },
          { user_id: 'u-old' },
          { user_id: 'u-adm' },
          { user_id: 'u-req' },
        ],
      },
    });
    const r = await createStaffRepository(client).listAssignableAgents('tm1');
    expect(r).toEqual({ ok: true, data: [{ id: 'u-a1', name: 'Alex Agent', role: 'agent' }] });
  });

  it('assignable agents for a ticket without a team: every active agent/supervisor', async () => {
    const { client } = fakeClient({ profiles });
    const r = await createStaffRepository(client).listAssignableAgents(null);
    expect(r.ok && r.data.map((a) => a.id)).toEqual(['u-a1', 'u-a2']);
  });

  it('users carry their team ids', async () => {
    const { client } = fakeClient({
      profiles,
      team_members: {
        data: [
          { team_id: 'tm1', user_id: 'u-a1' },
          { team_id: 'tm2', user_id: 'u-a1' },
        ],
      },
    });
    const r = await createStaffRepository(client).listUsers();
    expect(r.ok && r.data.find((u) => u.id === 'u-a1')).toMatchObject({
      displayName: 'Alex Agent',
      teamIds: ['tm1', 'tm2'],
    });
  });

  it('audit rows: names, team name on membership changes, and a limit', async () => {
    const { client, calls } = fakeClient({
      admin_audit_events: {
        data: [
          {
            id: 2,
            actor_id: 'u-adm',
            action: 'user_role_changed',
            target_type: 'profile',
            target_id: 'u-a1',
            old_value: { role: 'requester' },
            new_value: { role: 'agent' },
            created_at: 'c',
          },
          {
            id: 1,
            actor_id: 'u-adm',
            action: 'team_membership_changed',
            target_type: 'team',
            target_id: 'tm1',
            old_value: null,
            new_value: { user_id: 'u-a2', member: true },
            created_at: 'c',
          },
        ],
      },
      profiles,
      teams: { data: [{ id: 'tm1', name: 'Net team' }] },
    });
    const r = await createStaffRepository(client).listAdminAudit();
    expect(r).toMatchObject({
      ok: true,
      data: [
        { actorName: 'Ada Admin', targetName: 'Alex Agent', action: 'user_role_changed' },
        { targetName: 'Bo Agent', newValue: { member: true, team_name: 'Net team' } },
      ],
    });
    expect(
      calls.find((c) => c.table === 'admin_audit_events' && c.method === 'limit')?.args,
    ).toEqual([AUDIT_LIMIT]);
  });

  it('turns query errors into typed errors', async () => {
    const { client } = fakeClient({
      tickets: { error: { message: 'TypeError: Failed to fetch' } },
    });
    expect(await createStaffRepository(client).listQueue()).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('is unconfigured without a backend client', async () => {
    expect(await createStaffRepository(null).listQueue()).toMatchObject({
      ok: false,
      error: { kind: 'unconfigured' },
    });
  });
});

describe('staff repository actions call the server-side functions', () => {
  const cases: [
    string,
    (r: ReturnType<typeof createStaffRepository>) => Promise<unknown>,
    string,
    Record<string, unknown>,
  ][] = [
    [
      'acknowledge',
      (r) => r.acknowledge('t1', 4),
      'acknowledge_ticket',
      { p_ticket_id: 't1', p_expected_version: 4 },
    ],
    [
      'startWork',
      (r) => r.startWork('t1', 4),
      'start_work',
      { p_ticket_id: 't1', p_expected_version: 4 },
    ],
    [
      'resolve',
      (r) => r.resolve('t1', 'Fixed', 4),
      'resolve_ticket',
      { p_ticket_id: 't1', p_summary: 'Fixed', p_expected_version: 4 },
    ],
    [
      'reopen',
      (r) => r.reopen('t1', 'Again', 4),
      'reopen_ticket',
      { p_ticket_id: 't1', p_reason: 'Again', p_expected_version: 4 },
    ],
    [
      'assign',
      (r) => r.assign('t1', 'u-a1', 4, 'cover'),
      'assign_ticket',
      { p_ticket_id: 't1', p_assignee_id: 'u-a1', p_expected_version: 4, p_reason: 'cover' },
    ],
    [
      'assign (no reason)',
      (r) => r.assign('t1', 'u-a1', 4),
      'assign_ticket',
      { p_ticket_id: 't1', p_assignee_id: 'u-a1', p_expected_version: 4, p_reason: null },
    ],
    [
      'addComment',
      (r) => r.addComment('t1', 'hi', 'internal'),
      'add_comment',
      { p_ticket_id: 't1', p_body: 'hi', p_visibility: 'internal' },
    ],
    [
      'setUserRole',
      (r) => r.setUserRole('u-a1', 'supervisor'),
      'admin_set_user_role',
      { p_user_id: 'u-a1', p_role: 'supervisor' },
    ],
    [
      'setUserActive',
      (r) => r.setUserActive('u-a1', false),
      'admin_set_user_active',
      { p_user_id: 'u-a1', p_active: false },
    ],
    [
      'setTeamMember',
      (r) => r.setTeamMember('tm1', 'u-a1', true),
      'admin_set_team_member',
      { p_team_id: 'tm1', p_user_id: 'u-a1', p_member: true },
    ],
  ];
  it.each(cases)('%s', async (_n, call, fn, params) => {
    const { client, raw } = fakeClient({}, { data: null });
    expect(await call(createStaffRepository(client))).toMatchObject({ ok: true });
    expect(raw.rpc).toHaveBeenCalledWith(fn, params);
  });

  it('upsertCategory trims, nulls an empty description and maps the result', async () => {
    const { client, raw } = fakeClient(
      {},
      {
        data: {
          id: 'c9',
          name: 'Facilities',
          description: null,
          active: true,
          sort_order: 5,
          default_team_id: 'tm1',
        },
      },
    );
    const r = await createStaffRepository(client).upsertCategory({
      id: null,
      name: '  Facilities ',
      description: '  ',
      active: true,
      sortOrder: 5,
      defaultTeamId: 'tm1',
    });
    expect(raw.rpc).toHaveBeenCalledWith('admin_upsert_category', {
      p_id: null,
      p_name: 'Facilities',
      p_description: null,
      p_active: true,
      p_sort_order: 5,
      p_default_team_id: 'tm1',
    });
    expect(r).toEqual({
      ok: true,
      data: {
        id: 'c9',
        name: 'Facilities',
        description: null,
        active: true,
        sortOrder: 5,
        defaultTeamId: 'tm1',
      },
    });
  });

  it('returns typed errors and never throws on network failures', async () => {
    const { client, raw } = fakeClient({});
    raw.rpc.mockRejectedValue(new TypeError('Network request failed'));
    expect(await createStaffRepository(client).acknowledge('t1', 1)).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    });
  });
});

describe('classifyError', () => {
  it.each([
    [{ code: '40001', message: 'stale_version' }, 'stale'],
    [
      { code: '54000', message: 'rate_limited: too many requests, please try again later' },
      'rate_limited',
    ],
    [{ message: 'invalid_transition: new -> resolved' }, 'invalid_transition'],
    [{ message: 'forbidden: admins cannot change their own role', code: '42501' }, 'validation'],
    [{ message: 'forbidden: admins cannot deactivate themselves' }, 'validation'],
    [{ message: 'invalid_input: resolution summary is required' }, 'validation'],
    [
      { message: 'duplicate key value violates unique constraint "ticket_categories_name_key"' },
      'validation',
    ],
    [{ code: '42501', message: 'forbidden' }, 'forbidden'],
    [{ code: 'P0002', message: 'ticket_not_found' }, 'not_found'],
    [{ message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'secret stack trace at db.internal:5432' }, 'unknown'],
  ])('%j -> %s', (err, kind) => expect(classifyError(err).kind).toBe(kind));

  it('never leaks raw text for unknown errors and cleans our validation messages', () => {
    expect(classifyError({ message: 'secret stack trace' }).message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(
      classifyError({ message: 'invalid_input: resolution summary is required' }).message,
    ).toBe('Resolution summary is required');
    expect(
      classifyError({ message: 'forbidden: admins cannot change their own role' }).message,
    ).toBe("You can't change your own role.");
  });
});

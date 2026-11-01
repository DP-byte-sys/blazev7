import { createTicketRepository } from '../repositories/ticketRepository';
import { classifyError } from '../repositories/result';
import { buildTimeline } from '../features/tickets/timeline';
import { replyAlreadySent, validateReason, validateReply } from '../features/tickets/reply';
import { validateDraft } from '../features/tickets/validation';
import { formatRelative } from '../utils/time';

type Result = { data?: unknown; error?: unknown };
function fakeClient(tables: Record<string, Result>, rpc: Result = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const chain = (table: string): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, key: string) =>
        key === 'then'
          ? (res: (v: Result) => void) => res(tables[table] ?? {})
          : (...args: unknown[]) => {
              calls.push({ table, method: key, args });
              return p;
            },
    });
    return p;
  };
  const client = { from: jest.fn((t: string) => chain(t)), rpc: jest.fn(async () => rpc) };
  return { client: client as never, raw: client, calls };
}

describe('ticket repository', () => {
  it("lists only the signed-in user's tickets (explicit requester filter) and maps rows", async () => {
    const { client, calls } = fakeClient({
      tickets: {
        data: [
          {
            id: 't1',
            reference: 'BLZ-000001',
            title: 'A',
            status: 'new',
            priority: 'low',
            updated_at: '2026-10-29T10:00:00Z',
            ticket_categories: { name: 'Network' },
          },
        ],
      },
    });
    const r = await createTicketRepository(client).listMyTickets('user-1');
    expect(r).toEqual({
      ok: true,
      data: [
        {
          id: 't1',
          reference: 'BLZ-000001',
          title: 'A',
          status: 'new',
          priority: 'low',
          category: 'Network',
          updatedAt: '2026-10-29T10:00:00Z',
        },
      ],
    });
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['requester_id', 'user-1']);
  });

  it('returns not_found when the ticket is not visible (RLS returns no row)', async () => {
    const { client } = fakeClient({ tickets: { data: null } });
    const r = await createTicketRepository(client).getTicket('someone-elses');
    expect(r).toMatchObject({ ok: false, error: { kind: 'not_found' } });
  });

  it('calls the create_ticket function with the idempotency key', async () => {
    const row = {
      id: 't1',
      reference: 'BLZ-000001',
      title: 'A',
      description: 'D',
      status: 'new',
      priority: 'normal',
      version: 1,
      created_at: 'c',
      updated_at: 'u',
      resolution_summary: null,
    };
    const { client, raw } = fakeClient({}, { data: row });
    const r = await createTicketRepository(client).createTicket({
      clientRequestId: 'k',
      categoryId: 'c',
      title: 'A',
      description: 'D',
      priority: 'normal',
    });
    expect(r).toMatchObject({ ok: true, data: { reference: 'BLZ-000001', status: 'new' } });
    expect(raw.rpc).toHaveBeenCalledWith('create_ticket', {
      p_client_request_id: 'k',
      p_category_id: 'c',
      p_title: 'A',
      p_description: 'D',
      p_priority: 'normal',
    });
  });

  it('turns thrown network failures into a typed network error', async () => {
    const { client, raw } = fakeClient({});
    raw.rpc.mockRejectedValue(new TypeError('Network request failed'));
    const r = await createTicketRepository(client).createTicket({
      clientRequestId: 'k',
      categoryId: 'c',
      title: 'A',
      description: 'D',
      priority: 'normal',
    });
    expect(r).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('reports unconfigured when there is no backend client', async () => {
    expect(await createTicketRepository(null).listCategories()).toMatchObject({
      ok: false,
      error: { kind: 'unconfigured' },
    });
  });
});

describe('reply and reopen calls', () => {
  it('addReply always sends a PUBLIC comment (requesters can never post internal notes)', async () => {
    const { client, raw } = fakeClient({}, { data: null });
    expect(await createTicketRepository(client).addReply('t1', 'Hello')).toEqual({
      ok: true,
      data: undefined,
    });
    expect(raw.rpc).toHaveBeenCalledWith('add_comment', {
      p_ticket_id: 't1',
      p_body: 'Hello',
      p_visibility: 'public',
    });
  });
  it('reopenTicket sends the reason and the expected version', async () => {
    const { client, raw } = fakeClient({}, { data: null });
    await createTicketRepository(client).reopenTicket('t1', 'Again', 9);
    expect(raw.rpc).toHaveBeenCalledWith('reopen_ticket', {
      p_ticket_id: 't1',
      p_reason: 'Again',
      p_expected_version: 9,
    });
  });
  it('returns typed errors and does not throw on network failure', async () => {
    const { client, raw } = fakeClient({});
    raw.rpc.mockRejectedValue(new TypeError('Network request failed'));
    expect(await createTicketRepository(client).addReply('t1', 'Hello')).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    });
    raw.rpc.mockResolvedValue({ error: { code: '40001', message: 'stale_version' } });
    expect(await createTicketRepository(client).reopenTicket('t1', 'x', 1)).toMatchObject({
      ok: false,
      error: { kind: 'stale' },
    });
    raw.rpc.mockResolvedValue({ error: { message: 'invalid_transition: new -> reopened' } });
    expect(await createTicketRepository(client).reopenTicket('t1', 'x', 1)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_transition' },
    });
  });
  it('is unconfigured without a backend client', async () => {
    expect(await createTicketRepository(null).addReply('t1', 'x')).toMatchObject({
      ok: false,
      error: { kind: 'unconfigured' },
    });
  });
});

describe('replyAlreadySent and validators', () => {
  const c = (body: string, who = 'me', at = '2026-10-30T10:00:00Z') => ({
    id: body,
    author_id: who,
    body,
    created_at: at,
  });
  const now = new Date('2026-10-30T10:01:00Z');
  it('recognises the same message from the same user within five minutes', () => {
    expect(replyAlreadySent([c('Hello ')], 'me', ' Hello', now)).toBe(true);
  });
  it('does not match other users, other text, or old messages', () => {
    expect(replyAlreadySent([c('Hello', 'staff')], 'me', 'Hello', now)).toBe(false);
    expect(replyAlreadySent([c('Hello')], 'me', 'Hello there', now)).toBe(false);
    expect(replyAlreadySent([c('Hello', 'me', '2026-10-30T09:00:00Z')], 'me', 'Hello', now)).toBe(
      false,
    );
  });
  it('validates reply and reason length', () => {
    expect(validateReply('  ')).toBe('Write something first.');
    expect(validateReply('x'.repeat(5001))).toMatch(/5000/);
    expect(validateReply('ok')).toBeNull();
    expect(validateReason('')).toMatch(/why/);
    expect(validateReason('x'.repeat(1001))).toMatch(/1000/);
    expect(validateReason('because')).toBeNull();
  });
});

describe('classifyError', () => {
  it.each([
    [{ message: 'idempotency_conflict: this request key was already used' }, 'conflict'],
    [{ code: '54000', message: 'rate_limited: too many requests' }, 'rate_limited'],
    [{ code: '40001', message: 'stale_version' }, 'stale'],
    [{ message: 'invalid_transition: new -> resolved' }, 'invalid_transition'],
    [{ message: 'invalid_input: title must be 1-200 characters' }, 'validation'],
    [{ code: '42501', message: 'forbidden' }, 'forbidden'],
    [{ code: 'P0002', message: 'ticket_not_found' }, 'not_found'],
    [{ message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'relation "x" does not exist' }, 'unknown'],
  ])('%j -> %s', (err, kind) => expect(classifyError(err).kind).toBe(kind));

  it('never leaks raw server text for unknown errors', () => {
    expect(classifyError({ message: 'secret stack trace at db.internal:5432' }).message).toBe(
      'Something went wrong. Please try again.',
    );
  });
  it('passes our own validation text through, cleaned up', () => {
    expect(
      classifyError({ message: 'invalid_input: title must be 1-200 characters' }).message,
    ).toBe('Title must be 1-200 characters');
  });
});

describe('timeline', () => {
  it('merges events and public replies in time order and hides staff identities', () => {
    const items = buildTimeline(
      [
        {
          id: 1,
          event_type: 'ticket_created',
          actor_id: 'me',
          reason: null,
          created_at: '2026-10-29T10:00:00Z',
        },
        {
          id: 2,
          event_type: 'acknowledged',
          actor_id: 'staff-1',
          reason: null,
          created_at: '2026-10-29T10:05:00Z',
        },
        {
          id: 3,
          event_type: 'comment_added',
          actor_id: 'staff-1',
          reason: null,
          created_at: '2026-10-29T10:06:00Z',
        },
        {
          id: 4,
          event_type: 'reopened',
          actor_id: 'me',
          reason: 'Still broken',
          created_at: '2026-10-29T12:00:00Z',
        },
      ],
      [
        {
          id: 'c1',
          author_id: 'staff-1',
          body: 'We are on it',
          created_at: '2026-10-29T10:06:00Z',
        },
      ],
      'me',
    );
    expect(items.map((i) => i.title)).toEqual([
      'Ticket created',
      'Support acknowledged your ticket',
      'Support replied',
      'Ticket reopened',
    ]);
    expect(items[2]).toMatchObject({ body: 'We are on it', who: 'support' });
    expect(items[3]).toMatchObject({ body: 'Still broken', who: 'you' });
    expect(JSON.stringify(items)).not.toContain('staff-1');
  });
});

describe('validation and time', () => {
  it('flags missing and over-long fields', () => {
    expect(
      validateDraft({ categoryId: null, title: '', description: '', priority: 'normal' }),
    ).toEqual({
      title: 'Title is required.',
      description: 'Description is required.',
      category: 'Choose a category.',
    });
    expect(
      validateDraft({ categoryId: 'c', title: 'x'.repeat(201), description: 'd', priority: 'low' })
        .title,
    ).toMatch(/200/);
    expect(
      validateDraft({ categoryId: 'c', title: ' ok ', description: 'd', priority: 'low' }),
    ).toEqual({});
  });
  it('formats relative time', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(formatRelative('2026-10-29T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-10-29T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelative('2026-10-29T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelative('2026-10-27T12:00:00Z', now)).toBe('2d ago');
    expect(formatRelative('2026-09-01T12:00:00Z', now)).toBe('2026-09-01');
    expect(formatRelative('nonsense', now)).toBe('');
  });
});

import { createLogger, redact, setLogSink, logger, type LogRecord } from './logger';
import { instrument } from '../repositories/instrument';
import { fail, ok } from '../repositories/result';

const collect = () => {
  const records: LogRecord[] = [];
  setLogSink((r) => records.push(r));
  return records;
};
const silence = () => setLogSink(() => {});

describe('redact', () => {
  it('replaces sensitive keys at any depth', () => {
    const out = redact({
      password: 'hunter2',
      token: 't',
      nested: {
        Authorization: 'Bearer x',
        title: 'My secret ticket',
        description: 'd',
        body: 'b',
        email: 'a@b.co',
        reason: 'r',
      },
      ok: 'fine',
    }) as Record<string, any>;
    expect(out.password).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
    expect(out.nested).toEqual({
      Authorization: '[redacted]',
      title: '[redacted]',
      description: '[redacted]',
      body: '[redacted]',
      email: '[redacted]',
      reason: '[redacted]',
    });
    expect(out.ok).toBe('fine');
  });
  it('keeps safe diagnostic fields', () => {
    expect(
      redact({
        op: 'createTicket',
        kind: 'network',
        code: '54000',
        status: 429,
        durationMs: 12,
        clientRequestId: 'abc',
      }),
    ).toEqual({
      op: 'createTicket',
      kind: 'network',
      code: '54000',
      status: 429,
      durationMs: 12,
      clientRequestId: 'abc',
    });
  });
  it('scrubs JWTs and email addresses that appear inside ordinary strings', () => {
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijk'].join('.'); // built at runtime so the secret scanner sees no token-shaped literal
    expect(redact(`bad token ${jwt} for jane.doe@example.com`)).toBe('bad token [jwt] for [email]');
  });
  it('truncates long strings and long arrays', () => {
    expect((redact('x'.repeat(500)) as string).length).toBe(201);
    expect((redact(Array.from({ length: 50 }, (_, i) => i)) as number[]).length).toBe(20);
  });
  it('reduces errors to their type and code (never message or stack)', () => {
    const e = Object.assign(new Error('Invalid login for secret@corp.test'), {
      code: 'invalid_credentials',
    });
    const out = redact({ error: e }) as { error: Record<string, unknown> };
    expect(out.error).toEqual({ errorType: 'Error', code: 'invalid_credentials' });
    expect(JSON.stringify(out)).not.toContain('secret@corp.test');
  });
  it('stops at a maximum depth', () => {
    expect(JSON.stringify(redact({ a: { b: { c: { d: 1 } } } }))).toContain('[truncated]');
  });
});

describe('createLogger', () => {
  it('emits one structured record with timestamp, level and event', () => {
    const records: LogRecord[] = [];
    const log = createLogger({
      sink: () => (r) => records.push(r),
      now: () => new Date('2026-10-30T10:00:00Z'),
    });
    log.warn('repo_failed', { op: 'listQueue', kind: 'network', title: 'secret' });
    expect(records).toEqual([
      {
        ts: '2026-10-30T10:00:00.000Z',
        level: 'warn',
        event: 'repo_failed',
        op: 'listQueue',
        kind: 'network',
        title: '[redacted]',
      },
    ]);
  });
  it('drops records below the minimum level', () => {
    const records: LogRecord[] = [];
    const log = createLogger({ sink: () => (r) => records.push(r), minLevel: 'warn' });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(records.map((r) => r.event)).toEqual(['c', 'd']);
  });
  it('never throws, even for circular input or a failing sink', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      createLogger({
        sink: () => () => {
          throw new Error('sink down');
        },
      }).error('x', circular),
    ).not.toThrow();
    expect(() => createLogger({ sink: () => () => {} }).error('x', circular)).not.toThrow();
  });
});

describe('instrument (repository logging)', () => {
  const repo = {
    createThing: async (_input: { title: string; clientRequestId: string }) =>
      fail('network', "Can't reach the server."),
    getThing: async (_id: string) => ok({ id: '1' }),
    breakThing: async () => fail('unknown', 'Something went wrong.'),
    gateThing: async () => fail('not_found', 'gone'),
  };
  afterEach(silence);

  it('logs failures with the operation, kind and duration, but never the arguments', async () => {
    const records = collect();
    const wrapped = instrument(repo, (op, args) =>
      op === 'createThing'
        ? { clientRequestId: (args[0] as { clientRequestId: string }).clientRequestId }
        : {},
    );
    const res = await wrapped.createThing({
      title: 'My private ticket title',
      clientRequestId: 'req-123',
    });
    expect(res).toMatchObject({ ok: false, error: { kind: 'network' } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'warn',
      event: 'repo_failed',
      op: 'createThing',
      kind: 'network',
      clientRequestId: 'req-123',
    });
    expect(typeof records[0]!.durationMs).toBe('number');
    expect(JSON.stringify(records)).not.toContain('My private ticket title');
  });
  it('maps severity: unknown -> error, expected business outcomes -> info, success -> debug (dropped by default)', async () => {
    const records = collect();
    const wrapped = instrument(repo);
    await wrapped.breakThing();
    await wrapped.gateThing();
    await wrapped.getThing('1');
    expect(records.map((r) => [r.op, r.level])).toEqual([
      ['breakThing', 'error'],
      ['gateThing', 'info'],
    ]);
  });
  it('returns results unchanged', async () => {
    silence();
    expect(await instrument(repo).getThing('1')).toEqual({ ok: true, data: { id: '1' } });
  });
});

describe('default logger', () => {
  it('can be redirected with setLogSink', () => {
    const records = collect();
    logger.info('hello', { password: 'x' });
    expect(records[0]).toMatchObject({ event: 'hello', password: '[redacted]' });
    silence();
  });
});

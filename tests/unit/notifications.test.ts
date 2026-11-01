import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTEMPTS,
  NOTIFICATION_KINDS,
  backoffMinutes,
  dispatchNotifications,
  errorCode,
  renderNotification,
  type NotificationChannel,
  type NotificationContext,
  type NotificationJob,
  type NotificationStore,
} from '../../packages/shared/src/notifications';

const job = (
  id: number,
  kind: NotificationJob['kind'] = 'ticket_acknowledged',
): NotificationJob => ({ id, ticketId: `t-${id}`, recipientId: 'u-1', kind, attempts: 1 });

function fakeStore(
  jobs: NotificationJob[],
  ctx: (j: NotificationJob) => NotificationContext | null = () => ({
    ticketReference: 'BLZ-000001',
    recipientActive: true,
  }),
) {
  return {
    claim: vi.fn(async (_n: number) => jobs),
    context: vi.fn(async (j: NotificationJob) => ctx(j)),
    complete: vi.fn(async (_id: number) => {}),
    fail: vi.fn(async (_id: number, _code: string) => {}),
  } satisfies NotificationStore;
}
const channel = (send: NotificationChannel['send']): NotificationChannel => ({
  name: 'test',
  send,
});

describe('renderNotification', () => {
  it('has a generic template for every kind that mentions only the ticket reference', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const m = renderNotification(job(1, kind), 'BLZ-000042');
      expect(m.subject).toContain('BLZ-000042');
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.body.length).toBeGreaterThan(5);
      expect(Object.keys(m).sort()).toEqual([
        'body',
        'jobId',
        'kind',
        'recipientId',
        'subject',
        'ticketId',
        'ticketReference',
      ]); // no title/description/name fields
    }
  });
});

describe('errorCode', () => {
  it('uses a safe code or error name, never the message', () => {
    expect(
      errorCode(Object.assign(new Error('mailbox bob@corp.test full'), { code: 'EAUTH' })),
    ).toBe('EAUTH');
    expect(errorCode(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('TimeoutError');
    expect(errorCode(new Error('boom for bob@corp.test'))).toBe('send_failed');
    expect(errorCode({ code: 'has spaces and bob@corp.test' })).toBe('send_failed');
    expect(errorCode(null)).toBe('send_failed');
  });
});

describe('backoff', () => {
  it('doubles each attempt, matching the database schedule', () => {
    expect([1, 2, 3, 4].map(backoffMinutes)).toEqual([2, 4, 8, 16]);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe('dispatchNotifications', () => {
  it('sends each claimed job once and marks it complete', async () => {
    const store = fakeStore([job(1), job(2, 'staff_reply')]);
    const send = vi.fn(async () => {});
    const summary = await dispatchNotifications({ store, channel: channel(send), limit: 7 });
    expect(store.claim).toHaveBeenCalledWith(7);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.complete.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(store.fail).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 2, sent: 2, skipped: 0, failed: 0, bookkeepingErrors: 0 });
  });

  it('records only a safe error code when sending fails, and keeps going', async () => {
    const store = fakeStore([job(1), job(2)]);
    const send = vi.fn(async (m: { jobId: number }) => {
      if (m.jobId === 1) throw new Error('550 mailbox jane@corp.test unavailable');
    });
    const logs: [string, Record<string, unknown>][] = [];
    const summary = await dispatchNotifications({
      store,
      channel: channel(send),
      log: (e, f) => logs.push([e, f]),
    });
    expect(store.fail).toHaveBeenCalledWith(1, 'send_failed');
    expect(store.complete).toHaveBeenCalledWith(2);
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    expect(JSON.stringify([store.fail.mock.calls, logs])).not.toContain('jane@corp.test');
  });

  it('finishes (does not send) when the recipient is inactive or the ticket is gone', async () => {
    const store = fakeStore([job(1), job(2), job(3)], (j) =>
      j.id === 1
        ? null
        : j.id === 2
          ? { ticketReference: 'BLZ-1', recipientActive: false }
          : { ticketReference: 'BLZ-3', recipientActive: true },
    );
    const send = vi.fn(async () => {});
    const summary = await dispatchNotifications({ store, channel: channel(send) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.complete.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(summary).toMatchObject({ sent: 1, skipped: 2 });
  });

  it('counts store failures without crashing and does not double-send', async () => {
    const store = fakeStore([job(1), job(2)]);
    store.complete.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    const send = vi.fn(async () => {});
    const summary = await dispatchNotifications({ store, channel: channel(send) });
    expect(summary).toMatchObject({ claimed: 2, sent: 1, bookkeepingErrors: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does nothing when nothing is due', async () => {
    const store = fakeStore([]);
    expect(await dispatchNotifications({ store, channel: channel(vi.fn()) })).toEqual({
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      bookkeepingErrors: 0,
    });
  });
});

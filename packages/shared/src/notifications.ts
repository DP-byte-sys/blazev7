// Provider-agnostic notification dispatching (Phase 6). No email/push provider is chosen yet (open decision):
// a provider is added later by implementing NotificationChannel. The database outbox (notification_outbox) is the queue.
// Messages are GENERIC on purpose: they carry the ticket reference, never titles, descriptions, notes or names.

export const NOTIFICATION_KINDS = [
  'ticket_acknowledged',
  'ticket_resolved',
  'ticket_reopened',
  'staff_reply',
  'assigned_to_you',
  'requester_reply',
  'requester_reopened',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const MAX_ATTEMPTS = 5;
/** Same schedule as the database function fail_notification: 2, 4, 8, ... minutes. */
export const backoffMinutes = (attempts: number): number => 2 ** attempts;

export interface NotificationJob {
  id: number;
  ticketId: string;
  recipientId: string;
  kind: NotificationKind;
  attempts: number;
}
export interface NotificationContext {
  ticketReference: string;
  recipientActive: boolean;
}
export interface NotificationMessage {
  jobId: number;
  ticketId: string;
  recipientId: string;
  kind: NotificationKind;
  ticketReference: string;
  subject: string;
  body: string;
}

export interface NotificationChannel {
  readonly name: string;
  /** Deliver one message. Throw on failure; the dispatcher records only a safe error code and retries later. */
  send(message: NotificationMessage): Promise<void>;
}

/** Storage side, implemented by a trusted worker using the service role (claim_notifications / complete_notification / fail_notification). */
export interface NotificationStore {
  claim(limit: number): Promise<NotificationJob[]>;
  /** Null when the ticket or recipient no longer exists. */
  context(job: NotificationJob): Promise<NotificationContext | null>;
  complete(jobId: number): Promise<void>;
  fail(jobId: number, errorCode: string): Promise<void>;
}

const TEMPLATES: Record<NotificationKind, (ref: string) => { subject: string; body: string }> = {
  ticket_acknowledged: (r) => ({
    subject: `Ticket ${r} acknowledged`,
    body: 'Support has acknowledged your ticket.',
  }),
  ticket_resolved: (r) => ({
    subject: `Ticket ${r} resolved`,
    body: 'Your ticket has been marked as resolved. Open the app to review it.',
  }),
  ticket_reopened: (r) => ({
    subject: `Ticket ${r} reopened`,
    body: 'Your ticket has been reopened.',
  }),
  staff_reply: (r) => ({
    subject: `New reply on ticket ${r}`,
    body: 'Support replied to your ticket. Open the app to read it.',
  }),
  assigned_to_you: (r) => ({
    subject: `Ticket ${r} assigned to you`,
    body: 'A ticket has been assigned to you.',
  }),
  requester_reply: (r) => ({
    subject: `Requester replied on ticket ${r}`,
    body: 'The requester added a reply to a ticket assigned to you.',
  }),
  requester_reopened: (r) => ({
    subject: `Ticket ${r} reopened by the requester`,
    body: 'The requester reopened a ticket assigned to you.',
  }),
};

export function renderNotification(
  job: NotificationJob,
  ticketReference: string,
): NotificationMessage {
  const { subject, body } = TEMPLATES[job.kind](ticketReference);
  return {
    jobId: job.id,
    ticketId: job.ticketId,
    recipientId: job.recipientId,
    kind: job.kind,
    ticketReference,
    subject,
    body,
  };
}

/** A short, safe code for storage and logs. Never the error message (it may contain addresses or provider details). */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(code)) return code;
  const name = (e as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(name) && name !== 'Error')
    return name;
  return 'send_failed';
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  bookkeepingErrors: number;
}
type LogFn = (event: string, fields: Record<string, unknown>) => void;

/** Claims due jobs and delivers them through one channel. One bad job never stops the others. */
export async function dispatchNotifications(opts: {
  store: NotificationStore;
  channel: NotificationChannel;
  limit?: number;
  log?: LogFn;
}): Promise<DispatchSummary> {
  const { store, channel, limit = 20, log = () => {} } = opts;
  const summary: DispatchSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    bookkeepingErrors: 0,
  };
  const jobs = await store.claim(limit);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    try {
      const ctx = await store.context(job);
      if (!ctx || !ctx.recipientActive) {
        await store.complete(job.id); // nothing to send to: finish it so it is not retried forever
        summary.skipped++;
        log('notification_skipped', {
          jobId: job.id,
          kind: job.kind,
          reason: ctx ? 'recipient_inactive' : 'target_missing',
        });
        continue;
      }
      try {
        await channel.send(renderNotification(job, ctx.ticketReference));
      } catch (e) {
        const code = errorCode(e);
        await store.fail(job.id, code);
        summary.failed++;
        log('notification_failed', {
          jobId: job.id,
          kind: job.kind,
          channel: channel.name,
          code,
          attempts: job.attempts,
        });
        continue;
      }
      await store.complete(job.id);
      summary.sent++;
      log('notification_sent', { jobId: job.id, kind: job.kind, channel: channel.name });
    } catch (e) {
      summary.bookkeepingErrors++; // the store itself failed; the claim times out and the job is reclaimed later
      log('notification_bookkeeping_failed', { jobId: job.id, code: errorCode(e) });
    }
  }
  return summary;
}

/** Development/default channel: writes a generic log line instead of sending anything. */
export function createLogChannel(log: LogFn): NotificationChannel {
  return {
    name: 'log',
    async send(m) {
      log('notification_would_send', {
        jobId: m.jobId,
        kind: m.kind,
        ticketReference: m.ticketReference,
      });
    },
  };
}

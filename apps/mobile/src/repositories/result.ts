export type RepoErrorKind =
  | 'network'
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'stale'
  | 'invalid_transition'
  | 'unconfigured'
  | 'rate_limited'
  | 'unknown';
export interface RepoError {
  kind: RepoErrorKind;
  message: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: RepoError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (kind: RepoErrorKind, message: string): Result<never> => ({
  ok: false,
  error: { kind, message },
});

interface ErrorLike {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/** Turns backend errors into typed, user-safe results. Only our own validation messages are passed through. */
export function classifyError(raw: unknown): RepoError {
  const e = (raw ?? {}) as ErrorLike;
  const msg = e.message ?? '';
  const lower = msg.toLowerCase();
  if (lower.includes('rate_limited') || e.code === '54000')
    return {
      kind: 'rate_limited',
      message: "You're doing that too often. Please wait a few minutes and try again.",
    };
  if (lower.includes('stale_version') || e.code === '40001') {
    return {
      kind: 'stale',
      message:
        "This ticket changed while you were looking at it. We've refreshed it; please check and try again.",
    };
  }
  if (lower.includes('invalid_transition')) {
    return {
      kind: 'invalid_transition',
      message: "That isn't available for this ticket's current status. We've refreshed it.",
    };
  }
  if (lower.includes('idempotency_conflict')) {
    return {
      kind: 'conflict',
      message:
        'This ticket was already sent with different text. Check My tickets before sending again.',
    };
  }
  if (lower.includes('invalid_input')) {
    return {
      kind: 'validation',
      message: msg.replace(/^.*invalid_input:\s*/i, '').replace(/^./, (c) => c.toUpperCase()),
    };
  }
  if (e.code === '42501' || lower.includes('forbidden') || lower.includes('permission denied')) {
    return { kind: 'forbidden', message: "You don't have permission to do that." };
  }
  if (e.code === 'P0002' || lower.includes('ticket_not_found'))
    return { kind: 'not_found', message: 'Ticket not found, or you do not have access to it.' };
  if (
    e.name === 'AuthRetryableFetchError' ||
    e.status === 0 ||
    /network|fetch|timeout|offline|connection/.test(lower)
  ) {
    return {
      kind: 'network',
      message: "Can't reach the server. Check your connection and try again.",
    };
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

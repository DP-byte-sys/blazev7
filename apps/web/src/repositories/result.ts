export type RepoErrorKind =
  | 'network'
  | 'validation'
  | 'forbidden'
  | 'not_found'
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
        'This ticket was changed by someone else. It has been refreshed; review it and try again.',
    };
  }
  if (lower.includes('invalid_transition')) {
    return {
      kind: 'invalid_transition',
      message:
        "That action isn't available for the ticket's current status. The ticket has been refreshed.",
    };
  }
  if (lower.includes('own role'))
    return { kind: 'validation', message: "You can't change your own role." };
  if (lower.includes('deactivate themselves'))
    return { kind: 'validation', message: "You can't deactivate your own account." };
  if (lower.includes('invalid_input')) {
    return {
      kind: 'validation',
      message: msg.replace(/^.*invalid_input:\s*/i, '').replace(/^./, (c) => c.toUpperCase()),
    };
  }
  if (lower.includes('duplicate key'))
    return { kind: 'validation', message: 'That name is already in use.' };
  if (lower.includes('violates check constraint'))
    return { kind: 'validation', message: 'One of the values is not allowed.' };
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

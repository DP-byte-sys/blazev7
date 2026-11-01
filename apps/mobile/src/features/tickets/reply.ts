import type { CommentRow } from './types';

export const REPLY_MAX = 5000; // mirror the server (add_comment); the server stays authoritative
export const REASON_MAX = 1000; // mirror the server (reopen_ticket)

export const validateReply = (text: string): string | null => {
  const t = text.trim();
  if (!t) return 'Write something first.';
  if (t.length > REPLY_MAX) return `Replies must be ${REPLY_MAX} characters or fewer.`;
  return null;
};

export const validateReason = (text: string): string | null => {
  const t = text.trim();
  if (!t) return 'Tell support why you are reopening this ticket.';
  if (t.length > REASON_MAX) return `The reason must be ${REASON_MAX} characters or fewer.`;
  return null;
};

/**
 * After a failed send we cannot tell whether the server received it (replies have no idempotency key).
 * If the refreshed timeline already contains this exact message from this user, it went through: do not resend.
 */
export function replyAlreadySent(
  comments: CommentRow[],
  viewerId: string,
  body: string,
  now: Date,
  windowMs = 5 * 60_000,
): boolean {
  const wanted = body.trim();
  return comments.some(
    (c) =>
      c.author_id === viewerId &&
      c.body.trim() === wanted &&
      now.getTime() - new Date(c.created_at).getTime() <= windowMs,
  );
}

import type { CommentRow, EventRow, TimelineItem } from './types';

const EVENT_TITLE: Record<string, string> = {
  ticket_created: 'Ticket created',
  acknowledged: 'Support acknowledged your ticket',
  work_started: 'Work started',
  assigned: 'Assigned to a support agent',
  reassigned: 'Reassigned to another support agent',
  resolved: 'Marked as resolved',
  reopened: 'Ticket reopened',
};

/**
 * Builds the requester-facing timeline from rows the database already filtered (RLS hides internal notes/events).
 * Staff identities are never shown: anyone other than the viewer appears as "Support".
 * `comment_added` events are skipped because the comment itself is shown.
 */
export function buildTimeline(
  events: EventRow[],
  comments: CommentRow[],
  viewerId: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const e of events) {
    if (e.event_type === 'comment_added') continue;
    items.push({
      key: `e${e.id}`,
      at: e.created_at,
      kind: 'event',
      title: EVENT_TITLE[e.event_type] ?? 'Ticket updated',
      body: e.event_type === 'reopened' && e.reason ? e.reason : undefined,
      who: e.actor_id === viewerId ? 'you' : 'support',
    });
  }
  for (const c of comments) {
    items.push({
      key: `c${c.id}`,
      at: c.created_at,
      kind: 'comment',
      title: c.author_id === viewerId ? 'You replied' : 'Support replied',
      body: c.body,
      who: c.author_id === viewerId ? 'you' : 'support',
    });
  }
  return items.sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) ||
      a.key.localeCompare(b.key),
  );
}

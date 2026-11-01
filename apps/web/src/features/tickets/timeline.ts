import type { StaffTimelineData, StaffTimelineEntry } from './types';

/** Staff timeline: every event and every note, with actor names and an explicit internal marker. */
export function buildStaffTimeline({
  events,
  comments,
  names,
}: StaffTimelineData): StaffTimelineEntry[] {
  const name = (id: unknown) => (typeof id === 'string' && names[id]) || 'Unknown user';
  const entries: StaffTimelineEntry[] = [];
  for (const e of events) {
    if (e.type === 'comment_added') continue; // the comment itself is listed below
    let title: string;
    switch (e.type) {
      case 'ticket_created':
        title = 'Ticket created';
        break;
      case 'acknowledged':
        title = 'Acknowledged';
        break;
      case 'work_started':
        title = 'Work started';
        break;
      case 'assigned':
        title = `Assigned to ${name(e.newValue?.assignee_id)}`;
        break;
      case 'reassigned':
        title = `Reassigned from ${name(e.oldValue?.assignee_id)} to ${name(e.newValue?.assignee_id)}`;
        break;
      case 'resolved':
        title = 'Resolved';
        break;
      case 'reopened':
        title = 'Reopened';
        break;
      default:
        title = 'Ticket updated';
    }
    entries.push({
      key: `e${e.id}`,
      at: e.at,
      kind: 'event',
      title,
      detail: e.reason ?? undefined,
      internal: e.internal,
      by: name(e.actorId),
    });
  }
  for (const c of comments) {
    entries.push({
      key: `c${c.id}`,
      at: c.at,
      kind: 'comment',
      title: c.visibility === 'internal' ? 'Internal note' : 'Public reply',
      detail: c.body,
      internal: c.visibility === 'internal',
      by: name(c.authorId),
    });
  }
  return entries.sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) ||
      a.key.localeCompare(b.key),
  );
}

import { describe, expect, it } from 'vitest';
import { summarizeAudit } from '../admin/auditSummary';
import { QUEUE, TIMELINE, AUDIT } from '../../test/fakeRepo';
import { formatDateTime, formatRelative } from '../../utils/time';
import { availableActions } from './actions';
import { DEFAULT_FILTERS, filterQueue } from './queueFilters';
import { buildStaffTimeline } from './timeline';

describe('availableActions mirrors the database transition matrix (display only)', () => {
  // DB: new->acknowledged->in_progress->resolved->reopened->acknowledged|in_progress; assignment not allowed when resolved.
  it.each([
    ['new', ['acknowledge', 'assign']],
    ['acknowledged', ['start_work', 'assign']],
    ['in_progress', ['resolve', 'assign']],
    ['resolved', ['reopen']],
    ['reopened', ['acknowledge', 'start_work', 'assign']],
  ] as const)('%s', (status, expected) => expect(availableActions(status)).toEqual(expected));

  it('never offers anything but reopen on a resolved ticket', () => {
    expect(availableActions('resolved')).not.toContain('assign');
    expect(availableActions('resolved')).not.toContain('resolve');
  });
});

describe('filterQueue', () => {
  const ids = (f: Partial<typeof DEFAULT_FILTERS>, me = 'user-1') =>
    filterQueue(QUEUE, { ...DEFAULT_FILTERS, ...f }, me).map((t) => t.id);
  it('hides resolved tickets by default', () => expect(ids({})).toEqual(['1', '2']));
  it('shows everything for status "all"', () =>
    expect(ids({ status: 'all' })).toEqual(['1', '2', '3']));
  it('filters by exact status', () => expect(ids({ status: 'resolved' })).toEqual(['3']));
  it('filters by assignment', () => {
    expect(ids({ status: 'all', assignment: 'mine' })).toEqual(['1']);
    expect(ids({ status: 'all', assignment: 'unassigned' })).toEqual(['2']);
  });
  it('filters by priority and combines filters', () => {
    expect(ids({ status: 'all', priority: 'high' })).toEqual(['1']);
    expect(ids({ status: 'all', priority: 'high', assignment: 'unassigned' })).toEqual([]);
  });
  it('searches reference, title, requester and category, ignoring case and spaces at the ends', () => {
    expect(ids({ status: 'all', search: '  BLZ-0003 ' })).toEqual(['3']);
    expect(ids({ status: 'all', search: 'monitor' })).toEqual(['2']);
    expect(ids({ status: 'all', search: 'SAM SENDER' })).toEqual(['2']);
    expect(ids({ status: 'all', search: 'accounts' })).toEqual(['3']);
  });
});

describe('buildStaffTimeline', () => {
  it('orders history, names actors, flags internal items and skips comment_added events', () => {
    const items = buildStaffTimeline(TIMELINE);
    expect(items.map((i) => i.title)).toEqual([
      'Ticket created',
      'Assigned to Alex Agent',
      'Public reply',
      'Internal note',
    ]);
    expect(items.map((i) => i.internal)).toEqual([false, true, false, true]);
    expect(items[1]).toMatchObject({ by: 'Alex Agent', detail: 'covering' });
  });
  it('falls back to "Unknown user" instead of leaking ids', () => {
    const items = buildStaffTimeline({
      events: [
        {
          id: 1,
          type: 'reassigned',
          actorId: 'ghost',
          reason: null,
          oldValue: { assignee_id: 'x1' },
          newValue: { assignee_id: 'x2' },
          at: '2026-01-01T00:00:00Z',
          internal: true,
        },
      ],
      comments: [],
      names: {},
    });
    expect(items[0]).toMatchObject({
      title: 'Reassigned from Unknown user to Unknown user',
      by: 'Unknown user',
    });
  });
});

describe('summarizeAudit and time helpers', () => {
  it('summarises admin changes', () => {
    expect(summarizeAudit(AUDIT[0]!)).toBe('Alex Agent: role requester → agent');
    expect(summarizeAudit(AUDIT[1]!)).toBe('Alex Agent added to Network');
    expect(
      summarizeAudit({ ...AUDIT[0]!, action: 'user_active_changed', newValue: { active: false } }),
    ).toBe('Alex Agent deactivated');
    expect(
      summarizeAudit({
        ...AUDIT[0]!,
        action: 'category_created',
        newValue: { name: 'Facilities' },
      }),
    ).toBe('Created category "Facilities"');
  });
  it('formats times', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(formatRelative('2026-10-29T11:00:00Z', now)).toBe('1h ago');
    expect(formatDateTime('2026-10-29T11:00:00Z')).not.toBe('');
    expect(formatDateTime('nonsense')).toBe('');
  });
});

import type { QueueTicket } from './types';
import type { TicketPriority, TicketStatus } from './labels';

export interface QueueFilters {
  status: 'open' | 'all' | TicketStatus;
  assignment: 'all' | 'mine' | 'unassigned';
  priority: 'all' | TicketPriority;
  search: string;
}
export const DEFAULT_FILTERS: QueueFilters = {
  status: 'open',
  assignment: 'all',
  priority: 'all',
  search: '',
};

/** Client-side filtering of the loaded queue (the database has already limited it to tickets the user may see). */
export function filterQueue(tickets: QueueTicket[], f: QueueFilters, myId: string): QueueTicket[] {
  const q = f.search.trim().toLowerCase();
  return tickets.filter((t) => {
    if (f.status === 'open' ? t.status === 'resolved' : f.status !== 'all' && t.status !== f.status)
      return false;
    if (f.assignment === 'mine' && t.assigneeId !== myId) return false;
    if (f.assignment === 'unassigned' && t.assigneeId !== null) return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (
      q &&
      !`${t.reference} ${t.title} ${t.requesterName} ${t.category}`.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
}

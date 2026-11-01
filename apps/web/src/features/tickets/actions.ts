import type { TicketStatus } from './labels';

export type TicketAction = 'acknowledge' | 'start_work' | 'resolve' | 'reopen' | 'assign';

/**
 * Which buttons to SHOW for a status. This mirrors the database transition matrix for convenience only:
 * the server re-checks every action (role, scope, state, version) and is the final authority.
 */
export function availableActions(status: TicketStatus): TicketAction[] {
  switch (status) {
    case 'new':
      return ['acknowledge', 'assign'];
    case 'acknowledged':
      return ['start_work', 'assign'];
    case 'in_progress':
      return ['resolve', 'assign'];
    case 'resolved':
      return ['reopen'];
    case 'reopened':
      return ['acknowledge', 'start_work', 'assign'];
  }
}

import type { TicketPriority } from '../features/tickets/labels';

export interface Draft {
  clientRequestId: string; // idempotency key; stays the same across retries of the same ticket
  categoryId: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  attempted: boolean; // true once a send was started (outcome may be unknown)
  updatedAt: string;
}

/** Local persistence for the single in-progress draft per user. A draft is NOT a submitted ticket. */
export interface DraftPersistence {
  get(userId: string): Promise<Draft | null>;
  save(userId: string, draft: Draft): Promise<void>;
  delete(userId: string): Promise<void>;
  deleteAll(): Promise<void>; // on sign-out, so another person on this device never sees prior data
}

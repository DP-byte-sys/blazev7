// Shared types. Authorization is NEVER decided here; it is enforced in Supabase (RLS + trusted logic).
export const TICKET_STATUSES = [
  'new',
  'acknowledged',
  'in_progress',
  'resolved',
  'reopened',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ROLES = ['requester', 'agent', 'supervisor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export * from './notifications';

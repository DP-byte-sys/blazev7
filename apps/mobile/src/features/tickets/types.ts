import type { TicketPriority, TicketStatus } from './labels';

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface TicketSummary {
  id: string;
  reference: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  updatedAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  resolutionSummary: string | null;
  version: number;
  createdAt: string;
}

export interface EventRow {
  id: number;
  event_type: string;
  actor_id: string;
  reason: string | null;
  created_at: string;
}
export interface CommentRow {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface TimelineItem {
  key: string;
  at: string;
  kind: 'event' | 'comment';
  title: string;
  body?: string;
  who: 'you' | 'support';
}

export type TicketStatus = 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'reopened';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  reopened: 'Reopened',
};
export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

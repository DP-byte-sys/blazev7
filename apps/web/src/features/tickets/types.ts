import type { TicketPriority, TicketStatus } from './labels';

export interface QueueTicket {
  id: string;
  reference: string;
  title: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  requesterName: string;
  teamName: string | null;
  updatedAt: string;
}
export interface StaffTicket extends QueueTicket {
  description: string;
  resolutionSummary: string | null;
  version: number;
  createdAt: string;
  teamId: string | null;
  requesterId: string;
}
export interface AuditEvent {
  id: number;
  type: string;
  actorId: string;
  reason: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  at: string;
  internal: boolean; // true when the requester cannot see this event
}
export interface StaffComment {
  id: string;
  authorId: string;
  body: string;
  visibility: 'public' | 'internal';
  at: string;
}
export interface StaffTimelineData {
  events: AuditEvent[];
  comments: StaffComment[];
  names: Record<string, string>;
}
export interface AgentOption {
  id: string;
  name: string;
  role: string;
}
export interface StaffTimelineEntry {
  key: string;
  at: string;
  kind: 'event' | 'comment';
  title: string;
  detail?: string;
  internal: boolean;
  by: string;
}

export interface AdminUser {
  id: string;
  displayName: string;
  role: 'requester' | 'agent' | 'supervisor' | 'admin';
  active: boolean;
  teamIds: string[];
}
export interface Team {
  id: string;
  name: string;
  active: boolean;
}
export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  defaultTeamId: string | null;
}
export interface CategoryInput {
  id: string | null;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  defaultTeamId: string | null;
}
export interface AdminAuditRow {
  id: number;
  actorName: string;
  targetName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  at: string;
}

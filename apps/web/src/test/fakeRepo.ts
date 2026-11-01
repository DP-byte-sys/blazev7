import { vi, type Mock } from 'vitest';
import type {
  AdminAuditRow,
  AdminUser,
  AgentOption,
  CategoryRow,
  QueueTicket,
  StaffTicket,
  StaffTimelineData,
  Team,
} from '../features/tickets/types';
import { fail, ok } from '../repositories/result';
import type { StaffRepository } from '../repositories/staffRepository';

export type FakeRepo = { [K in keyof StaffRepository]: Mock<StaffRepository[K]> };

export const ME = 'user-1'; // matches makeSession()'s default user id

const base = {
  category: 'Network',
  teamName: 'Network',
  requesterName: 'Riley Requester',
  updatedAt: '2026-10-29T10:00:00Z',
} as const;
export const QUEUE: QueueTicket[] = [
  {
    ...base,
    id: '1',
    reference: 'BLZ-0001',
    title: 'Cannot connect to office Wi-Fi',
    priority: 'high',
    status: 'in_progress',
    assigneeId: ME,
    assigneeName: 'Test admin',
  },
  {
    ...base,
    id: '2',
    reference: 'BLZ-0002',
    title: 'Request for a second monitor',
    category: 'Hardware',
    priority: 'low',
    status: 'new',
    assigneeId: null,
    assigneeName: null,
    requesterName: 'Sam Sender',
  },
  {
    ...base,
    id: '3',
    reference: 'BLZ-0003',
    title: 'Password reset not arriving',
    category: 'Accounts',
    priority: 'normal',
    status: 'resolved',
    assigneeId: 'agent-2',
    assigneeName: 'Alex Agent',
  },
];

export const ticketFor = (q: QueueTicket, over: Partial<StaffTicket> = {}): StaffTicket => ({
  ...q,
  description: 'Details of the problem',
  resolutionSummary: null,
  version: 3,
  createdAt: '2026-10-28T09:00:00Z',
  teamId: 'team-net',
  requesterId: 'req-1',
  ...over,
});

export const TIMELINE: StaffTimelineData = {
  events: [
    {
      id: 1,
      type: 'ticket_created',
      actorId: 'req-1',
      reason: null,
      oldValue: null,
      newValue: null,
      at: '2026-10-28T09:00:00Z',
      internal: false,
    },
    {
      id: 2,
      type: 'assigned',
      actorId: 'agent-2',
      reason: 'covering',
      oldValue: { assignee_id: null },
      newValue: { assignee_id: 'agent-2' },
      at: '2026-10-28T09:05:00Z',
      internal: true,
    },
  ],
  comments: [
    {
      id: 'c1',
      authorId: 'agent-2',
      body: 'Checking the access point',
      visibility: 'public',
      at: '2026-10-28T09:10:00Z',
    },
    {
      id: 'c2',
      authorId: 'agent-2',
      body: 'Probably a firmware bug',
      visibility: 'internal',
      at: '2026-10-28T09:11:00Z',
    },
  ],
  names: { 'req-1': 'Riley Requester', 'agent-2': 'Alex Agent' },
};

export const AGENTS: AgentOption[] = [
  { id: ME, name: 'Test admin', role: 'admin' }, // filtered out by the server in reality; here to prove the UI hides the current assignee only
  { id: 'agent-2', name: 'Alex Agent', role: 'agent' },
  { id: 'sup-1', name: 'Sam Supervisor', role: 'supervisor' },
];

export const USERS: AdminUser[] = [
  { id: ME, displayName: 'Test admin', role: 'admin', active: true, teamIds: [] },
  { id: 'agent-2', displayName: 'Alex Agent', role: 'agent', active: true, teamIds: ['team-net'] },
  { id: 'req-1', displayName: 'Riley Requester', role: 'requester', active: true, teamIds: [] },
  { id: 'agent-3', displayName: 'Gone Agent', role: 'agent', active: false, teamIds: [] },
];
export const TEAMS: Team[] = [
  { id: 'team-net', name: 'Network', active: true },
  { id: 'team-it', name: 'IT Support', active: true },
];
export const CATEGORIES: CategoryRow[] = [
  {
    id: 'cat-1',
    name: 'Network',
    description: 'Wi-Fi and VPN',
    active: true,
    sortOrder: 1,
    defaultTeamId: 'team-net',
  },
  {
    id: 'cat-2',
    name: 'Retired',
    description: null,
    active: false,
    sortOrder: 9,
    defaultTeamId: null,
  },
];
export const AUDIT: AdminAuditRow[] = [
  {
    id: 2,
    actorName: 'Test admin',
    targetName: 'Alex Agent',
    action: 'user_role_changed',
    targetType: 'profile',
    targetId: 'agent-2',
    oldValue: { role: 'requester' },
    newValue: { role: 'agent' },
    at: '2026-10-29T10:00:00Z',
  },
  {
    id: 1,
    actorName: 'Test admin',
    targetName: 'Alex Agent',
    action: 'team_membership_changed',
    targetType: 'team',
    targetId: 'team-net',
    oldValue: null,
    newValue: { member: true, team_name: 'Network' },
    at: '2026-10-29T09:00:00Z',
  },
];

/** A repository whose every method is a vi.fn with sensible, successful defaults. Override per test. */
export function fakeRepo(): FakeRepo {
  return {
    listQueue: vi.fn(async () => ok(QUEUE)),
    getTicket: vi.fn(async (id: string) => {
      const q = QUEUE.find((t) => t.id === id);
      return q
        ? ok(ticketFor(q))
        : fail('not_found', 'Ticket not found, or you do not have access to it.');
    }),
    getTimeline: vi.fn(async () => ok(TIMELINE)),
    listAssignableAgents: vi.fn(async () => ok(AGENTS)),
    acknowledge: vi.fn(async () => ok(undefined)),
    startWork: vi.fn(async () => ok(undefined)),
    resolve: vi.fn(async () => ok(undefined)),
    reopen: vi.fn(async () => ok(undefined)),
    assign: vi.fn(async () => ok(undefined)),
    addComment: vi.fn(async () => ok(undefined)),
    listUsers: vi.fn(async () => ok(USERS)),
    listTeams: vi.fn(async () => ok(TEAMS)),
    setUserRole: vi.fn(async () => ok(undefined)),
    setUserActive: vi.fn(async () => ok(undefined)),
    setTeamMember: vi.fn(async () => ok(undefined)),
    listCategories: vi.fn(async () => ok(CATEGORIES)),
    upsertCategory: vi.fn(async () => ok(CATEGORIES[0]!)),
    listAdminAudit: vi.fn(async () => ok(AUDIT)),
  };
}

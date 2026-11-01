import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketPriority, TicketStatus } from '../features/tickets/labels';
import type {
  AdminAuditRow,
  AdminUser,
  AgentOption,
  AuditEvent,
  CategoryInput,
  CategoryRow,
  QueueTicket,
  StaffComment,
  StaffTicket,
  StaffTimelineData,
  Team,
} from '../features/tickets/types';
import { instrument } from './instrument';
import { classifyError, fail, ok, type Result } from './result';

export interface StaffRepository {
  listQueue(): Promise<Result<QueueTicket[]>>;
  getTicket(id: string): Promise<Result<StaffTicket>>;
  getTimeline(id: string): Promise<Result<StaffTimelineData>>;
  listAssignableAgents(teamId: string | null): Promise<Result<AgentOption[]>>;
  acknowledge(id: string, version: number): Promise<Result<void>>;
  startWork(id: string, version: number): Promise<Result<void>>;
  resolve(id: string, summary: string, version: number): Promise<Result<void>>;
  reopen(id: string, reason: string, version: number): Promise<Result<void>>;
  assign(id: string, assigneeId: string, version: number, reason?: string): Promise<Result<void>>;
  addComment(id: string, body: string, visibility: 'public' | 'internal'): Promise<Result<void>>;
  listUsers(): Promise<Result<AdminUser[]>>;
  listTeams(): Promise<Result<Team[]>>;
  setUserRole(userId: string, role: AdminUser['role']): Promise<Result<void>>;
  setUserActive(userId: string, active: boolean): Promise<Result<void>>;
  setTeamMember(teamId: string, userId: string, member: boolean): Promise<Result<void>>;
  listCategories(): Promise<Result<CategoryRow[]>>;
  upsertCategory(input: CategoryInput): Promise<Result<CategoryRow>>;
  listAdminAudit(): Promise<Result<AdminAuditRow[]>>;
}

export const QUEUE_LIMIT = 200;
export const AUDIT_LIMIT = 100;

const TICKET_COLS =
  'id, reference, requester_id, category_id, team_id, title, description, priority, status, assignee_id, resolution_summary, version, created_at, updated_at';

interface TicketRow {
  id: string;
  reference: string;
  requester_id: string;
  category_id: string;
  team_id: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee_id: string | null;
  resolution_summary: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
interface ProfileRow {
  id: string;
  display_name: string;
  role: AdminUser['role'];
  active: boolean;
}
interface CategoryDb {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  default_team_id: string | null;
}
interface TeamDb {
  id: string;
  name: string;
  active: boolean;
}
interface MemberDb {
  team_id: string;
  user_id: string;
}
interface EventDb {
  id: number;
  actor_id: string;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  visible_to_requester: boolean;
  created_at: string;
}
interface CommentDb {
  id: string;
  author_id: string;
  body: string;
  visibility: 'public' | 'internal';
  created_at: string;
}
interface AuditDb {
  id: number;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}
interface QueryResult {
  data: unknown;
  error: unknown;
}

const toCategory = (c: CategoryDb): CategoryRow => ({
  id: c.id,
  name: c.name,
  description: c.description,
  active: c.active,
  sortOrder: c.sort_order,
  defaultTeamId: c.default_team_id,
});
const UNKNOWN = 'Unknown user';

/**
 * Every call goes through the authenticated client: row-level security decides what is visible, and the
 * server-side functions re-check role, scope, state and version and write the audit trail.
 * Nothing in this file is a security boundary.
 */
export function createStaffRepository(client: SupabaseClient | null): StaffRepository {
  // ids (ticket/user) are safe to log; arguments with text are not logged
  return instrument(buildStaffRepository(client), (_op, args) =>
    typeof args[0] === 'string' ? { id: args[0] } : {},
  );
}

function buildStaffRepository(client: SupabaseClient | null): StaffRepository {
  const unconfigured = fail('unconfigured', 'The app is not connected to a backend yet.');
  const arr = <T>(d: unknown) => (d ?? []) as T[];
  const from = (t: string) => client!.from(t);

  async function reads<T>(
    queries: () => PromiseLike<QueryResult>[],
    build: (data: unknown[]) => T | null,
  ): Promise<Result<T>> {
    if (!client) return unconfigured;
    try {
      const results = await Promise.all(queries());
      for (const r of results) if (r.error) return { ok: false, error: classifyError(r.error) };
      const built = build(results.map((r) => r.data));
      return built === null
        ? fail('not_found', 'Ticket not found, or you do not have access to it.')
        : ok(built);
    } catch (e) {
      return { ok: false, error: classifyError(e) };
    }
  }

  async function rpc<T>(name: string, params: Record<string, unknown>): Promise<Result<T>> {
    if (!client) return unconfigured;
    try {
      const { data, error } = await client.rpc(name, params);
      return error ? { ok: false, error: classifyError(error) } : ok(data as T);
    } catch (e) {
      return { ok: false, error: classifyError(e) };
    }
  }
  const rpcDone = async (name: string, params: Record<string, unknown>): Promise<Result<void>> => {
    const r = await rpc<unknown>(name, params);
    return r.ok ? ok(undefined) : r;
  };

  const lookups = () => [
    from('profiles').select('id, display_name'),
    from('ticket_categories').select('id, name'),
    from('teams').select('id, name'),
  ];
  function mapTicket(t: TicketRow, [p, c, tm]: unknown[]): StaffTicket {
    const names = new Map(
      arr<{ id: string; display_name: string }>(p).map((x) => [x.id, x.display_name]),
    );
    const cats = new Map(arr<{ id: string; name: string }>(c).map((x) => [x.id, x.name]));
    const teams = new Map(arr<{ id: string; name: string }>(tm).map((x) => [x.id, x.name]));
    return {
      id: t.id,
      reference: t.reference,
      title: t.title,
      category: cats.get(t.category_id) ?? '',
      priority: t.priority,
      status: t.status,
      assigneeId: t.assignee_id,
      assigneeName: t.assignee_id ? (names.get(t.assignee_id) ?? UNKNOWN) : null,
      requesterName: names.get(t.requester_id) ?? UNKNOWN,
      teamName: t.team_id ? (teams.get(t.team_id) ?? null) : null,
      updatedAt: t.updated_at,
      description: t.description,
      resolutionSummary: t.resolution_summary,
      version: t.version,
      createdAt: t.created_at,
      teamId: t.team_id,
      requesterId: t.requester_id,
    };
  }

  return {
    listQueue: () =>
      reads(
        () => [
          from('tickets')
            .select(TICKET_COLS)
            .order('updated_at', { ascending: false })
            .limit(QUEUE_LIMIT),
          ...lookups(),
        ],
        ([t, ...rest]) => arr<TicketRow>(t).map((row) => mapTicket(row, rest)),
      ),

    getTicket: (id) =>
      reads(
        () => [from('tickets').select(TICKET_COLS).eq('id', id).maybeSingle(), ...lookups()],
        ([t, ...rest]) => (t ? mapTicket(t as TicketRow, rest) : null),
      ),

    getTimeline: (id) =>
      reads(
        () => [
          from('ticket_events')
            .select(
              'id, actor_id, event_type, old_value, new_value, reason, visible_to_requester, created_at',
            )
            .eq('ticket_id', id)
            .order('id'),
          from('ticket_comments')
            .select('id, author_id, body, visibility, created_at')
            .eq('ticket_id', id)
            .order('created_at'),
          from('profiles').select('id, display_name'),
        ],
        ([e, c, p]) => ({
          events: arr<EventDb>(e).map<AuditEvent>((x) => ({
            id: x.id,
            type: x.event_type,
            actorId: x.actor_id,
            reason: x.reason,
            oldValue: x.old_value,
            newValue: x.new_value,
            at: x.created_at,
            internal: !x.visible_to_requester,
          })),
          comments: arr<CommentDb>(c).map<StaffComment>((x) => ({
            id: x.id,
            authorId: x.author_id,
            body: x.body,
            visibility: x.visibility,
            at: x.created_at,
          })),
          names: Object.fromEntries(
            arr<{ id: string; display_name: string }>(p).map((x) => [x.id, x.display_name]),
          ),
        }),
      ),

    listAssignableAgents: (teamId) =>
      reads(
        () => [
          from('profiles')
            .select('id, display_name, role, active')
            .eq('active', true)
            .in('role', ['agent', 'supervisor'])
            .order('display_name'),
          teamId
            ? from('team_members').select('user_id').eq('team_id', teamId)
            : Promise.resolve({ data: null, error: null }),
        ],
        ([p, m]) => {
          const inTeam = teamId ? new Set(arr<{ user_id: string }>(m).map((x) => x.user_id)) : null;
          return arr<ProfileRow>(p)
            .filter(
              (x) =>
                x.active &&
                (x.role === 'agent' || x.role === 'supervisor') &&
                (!inTeam || inTeam.has(x.id)),
            )
            .map<AgentOption>((x) => ({ id: x.id, name: x.display_name, role: x.role }));
        },
      ),

    acknowledge: (id, v) =>
      rpcDone('acknowledge_ticket', { p_ticket_id: id, p_expected_version: v }),
    startWork: (id, v) => rpcDone('start_work', { p_ticket_id: id, p_expected_version: v }),
    resolve: (id, summary, v) =>
      rpcDone('resolve_ticket', { p_ticket_id: id, p_summary: summary, p_expected_version: v }),
    reopen: (id, reason, v) =>
      rpcDone('reopen_ticket', { p_ticket_id: id, p_reason: reason, p_expected_version: v }),
    assign: (id, assigneeId, v, reason) =>
      rpcDone('assign_ticket', {
        p_ticket_id: id,
        p_assignee_id: assigneeId,
        p_expected_version: v,
        p_reason: reason ?? null,
      }),
    addComment: (id, body, visibility) =>
      rpcDone('add_comment', { p_ticket_id: id, p_body: body, p_visibility: visibility }),

    listUsers: () =>
      reads(
        () => [
          from('profiles').select('id, display_name, role, active').order('display_name'),
          from('team_members').select('team_id, user_id'),
        ],
        ([p, m]) => {
          const members = arr<MemberDb>(m);
          return arr<ProfileRow>(p).map<AdminUser>((x) => ({
            id: x.id,
            displayName: x.display_name,
            role: x.role,
            active: x.active,
            teamIds: members.filter((mm) => mm.user_id === x.id).map((mm) => mm.team_id),
          }));
        },
      ),
    listTeams: () =>
      reads(
        () => [from('teams').select('id, name, active').order('name')],
        ([t]) => arr<TeamDb>(t).map<Team>((x) => ({ id: x.id, name: x.name, active: x.active })),
      ),
    setUserRole: (userId, role) =>
      rpcDone('admin_set_user_role', { p_user_id: userId, p_role: role }),
    setUserActive: (userId, active) =>
      rpcDone('admin_set_user_active', { p_user_id: userId, p_active: active }),
    setTeamMember: (teamId, userId, member) =>
      rpcDone('admin_set_team_member', { p_team_id: teamId, p_user_id: userId, p_member: member }),

    listCategories: () =>
      reads(
        () => [
          from('ticket_categories')
            .select('id, name, description, active, sort_order, default_team_id')
            .order('sort_order')
            .order('name'),
        ],
        ([c]) => arr<CategoryDb>(c).map(toCategory),
      ),
    upsertCategory: async (i) => {
      const r = await rpc<CategoryDb>('admin_upsert_category', {
        p_id: i.id,
        p_name: i.name.trim(),
        p_description: i.description.trim() || null,
        p_active: i.active,
        p_sort_order: i.sortOrder,
        p_default_team_id: i.defaultTeamId,
      });
      return r.ok ? ok(toCategory(r.data)) : r;
    },

    listAdminAudit: () =>
      reads(
        () => [
          from('admin_audit_events')
            .select(
              'id, actor_id, action, target_type, target_id, old_value, new_value, created_at',
            )
            .order('id', { ascending: false })
            .limit(AUDIT_LIMIT),
          from('profiles').select('id, display_name'),
          from('teams').select('id, name'),
        ],
        ([e, p, t]) => {
          const names = new Map(
            arr<{ id: string; display_name: string }>(p).map((x) => [x.id, x.display_name]),
          );
          const teams = new Map(arr<{ id: string; name: string }>(t).map((x) => [x.id, x.name]));
          return arr<AuditDb>(e).map<AdminAuditRow>((x) => {
            const membership = x.action === 'team_membership_changed';
            const memberId = membership ? (x.new_value?.user_id as string | undefined) : undefined;
            const targetName = membership
              ? memberId
                ? (names.get(memberId) ?? UNKNOWN)
                : null
              : x.target_type === 'profile' && x.target_id
                ? (names.get(x.target_id) ?? UNKNOWN)
                : null;
            return {
              id: x.id,
              actorName: names.get(x.actor_id) ?? UNKNOWN,
              targetName,
              action: x.action,
              targetType: x.target_type,
              targetId: x.target_id,
              oldValue: x.old_value,
              newValue: membership
                ? {
                    ...x.new_value,
                    team_name: x.target_id ? (teams.get(x.target_id) ?? null) : null,
                  }
                : x.new_value,
              at: x.created_at,
            };
          });
        },
      ),
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketPriority, TicketStatus } from '../features/tickets/labels';
import type {
  Category,
  CommentRow,
  EventRow,
  TicketDetail,
  TicketSummary,
} from '../features/tickets/types';
import { instrument } from './instrument';
import { classifyError, fail, ok, type Result } from './result';

export interface CreateTicketInput {
  clientRequestId: string;
  categoryId: string;
  title: string;
  description: string;
  priority: TicketPriority;
}
export interface TicketTimelineData {
  events: EventRow[];
  comments: CommentRow[];
}

export interface TicketRepository {
  listCategories(): Promise<Result<Category[]>>;
  listMyTickets(userId: string): Promise<Result<TicketSummary[]>>;
  getTicket(id: string): Promise<Result<TicketDetail>>;
  getTimeline(ticketId: string): Promise<Result<TicketTimelineData>>;
  createTicket(input: CreateTicketInput): Promise<Result<TicketDetail>>;
  /** Public reply from the requester. The server rejects internal notes from requesters and tickets they cannot see. */
  addReply(ticketId: string, body: string): Promise<Result<void>>;
  /** Requester (or staff) reopens a resolved ticket; a reason is mandatory and the version prevents stale changes. */
  reopenTicket(ticketId: string, reason: string, version: number): Promise<Result<void>>;
}

interface TicketRow {
  id: string;
  reference: string;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  resolution_summary?: string | null;
  version?: number;
  created_at?: string;
  updated_at: string;
  ticket_categories?: { name: string } | { name: string }[] | null;
}

const categoryName = (r: TicketRow) =>
  (Array.isArray(r.ticket_categories) ? r.ticket_categories[0]?.name : r.ticket_categories?.name) ??
  '';

const toSummary = (r: TicketRow): TicketSummary => ({
  id: r.id,
  reference: r.reference,
  title: r.title,
  status: r.status,
  priority: r.priority,
  category: categoryName(r),
  updatedAt: r.updated_at,
});
const toDetail = (r: TicketRow): TicketDetail => ({
  ...toSummary(r),
  description: r.description ?? '',
  resolutionSummary: r.resolution_summary ?? null,
  version: r.version ?? 1,
  createdAt: r.created_at ?? r.updated_at,
});

const COLUMNS =
  'id, reference, title, description, status, priority, resolution_summary, version, created_at, updated_at, ticket_categories(name)';

/**
 * All access goes through the authenticated Supabase client: row-level security decides what is visible
 * and create_ticket (a server-side function) validates and audits. Nothing here is a security boundary.
 */
export function createTicketRepository(client: SupabaseClient | null): TicketRepository {
  // the idempotency key is a random id (safe to log) and makes duplicate/retry problems traceable
  return instrument(buildTicketRepository(client), (op, args) => {
    const first = args[0] as { clientRequestId?: string } | string | undefined;
    if (typeof first === 'string') return { id: first }; // ticket ids are safe to log
    return op === 'createTicket' && typeof first === 'object' && first?.clientRequestId
      ? { clientRequestId: first.clientRequestId }
      : {};
  });
}

function buildTicketRepository(client: SupabaseClient | null): TicketRepository {
  const unconfigured = fail('unconfigured', 'The app is not connected to a backend yet.');
  async function rpcDone(name: string, params: Record<string, unknown>): Promise<Result<void>> {
    if (!client) return unconfigured;
    try {
      const { error } = await client.rpc(name, params);
      return error ? { ok: false, error: classifyError(error) } : ok(undefined);
    } catch (e) {
      return { ok: false, error: classifyError(e) }; // outcome unknown for thrown network failures
    }
  }
  return {
    async listCategories() {
      if (!client) return unconfigured;
      const { data, error } = await client
        .from('ticket_categories')
        .select('id, name, description')
        .eq('active', true)
        .order('sort_order')
        .order('name');
      return error ? { ok: false, error: classifyError(error) } : ok((data ?? []) as Category[]);
    },
    async listMyTickets(userId) {
      if (!client) return unconfigured;
      const { data, error } = await client
        .from('tickets')
        .select(COLUMNS)
        .eq('requester_id', userId)
        .order('updated_at', { ascending: false })
        .limit(100);
      return error
        ? { ok: false, error: classifyError(error) }
        : ok(((data ?? []) as unknown as TicketRow[]).map(toSummary));
    },
    async getTicket(id) {
      if (!client) return unconfigured;
      const { data, error } = await client
        .from('tickets')
        .select(COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) return { ok: false, error: classifyError(error) };
      return data
        ? ok(toDetail(data as unknown as TicketRow))
        : fail('not_found', 'Ticket not found, or you do not have access to it.');
    },
    async getTimeline(ticketId) {
      if (!client) return unconfigured;
      const [ev, co] = await Promise.all([
        client
          .from('ticket_events')
          .select('id, event_type, actor_id, reason, created_at')
          .eq('ticket_id', ticketId)
          .order('id'),
        client
          .from('ticket_comments')
          .select('id, author_id, body, created_at')
          .eq('ticket_id', ticketId)
          .order('created_at'),
      ]);
      if (ev.error) return { ok: false, error: classifyError(ev.error) };
      if (co.error) return { ok: false, error: classifyError(co.error) };
      return ok({
        events: (ev.data ?? []) as EventRow[],
        comments: (co.data ?? []) as CommentRow[],
      });
    },
    async addReply(ticketId, body) {
      return rpcDone('add_comment', {
        p_ticket_id: ticketId,
        p_body: body,
        p_visibility: 'public',
      });
    },
    async reopenTicket(ticketId, reason, version) {
      return rpcDone('reopen_ticket', {
        p_ticket_id: ticketId,
        p_reason: reason,
        p_expected_version: version,
      });
    },
    async createTicket(input) {
      if (!client) return unconfigured;
      try {
        const { data, error } = await client.rpc('create_ticket', {
          p_client_request_id: input.clientRequestId,
          p_category_id: input.categoryId,
          p_title: input.title,
          p_description: input.description,
          p_priority: input.priority,
        });
        if (error) return { ok: false, error: classifyError(error) };
        const row = data as unknown as {
          id: string;
          reference: string;
          title: string;
          description: string;
          status: TicketStatus;
          priority: TicketPriority;
          version: number;
          created_at: string;
          updated_at: string;
          resolution_summary: string | null;
        };
        return ok(toDetail({ ...row, ticket_categories: null }));
      } catch (e) {
        return { ok: false, error: classifyError(e) }; // thrown fetch failures: the outcome is unknown, so callers must retry with the SAME key
      }
    },
  };
}

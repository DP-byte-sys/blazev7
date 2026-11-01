import { create } from 'zustand';
import { logger } from '../lib/logger';
import type { Draft, DraftPersistence } from '../db/draftPersistence';
import type { TicketPriority } from '../features/tickets/labels';
import type { TicketDetail } from '../features/tickets/types';
import { hasErrors, validateDraft, type FieldErrors } from '../features/tickets/validation';
import type { TicketRepository } from '../repositories/ticketRepository';

/** none = nothing started; local_draft = saved on this device only; sending = request in flight; send_failed = not confirmed by the server. */
export type DraftStatus = 'none' | 'local_draft' | 'sending' | 'send_failed';

export interface DraftState {
  userId: string | null;
  draft: Draft | null;
  status: DraftStatus;
  message: string | null;
  fieldErrors: FieldErrors;
  persistError: boolean;
  load(userId: string): Promise<void>;
  update(patch: Partial<Pick<Draft, 'categoryId' | 'title' | 'description' | 'priority'>>): void;
  submit(): Promise<{ ok: true; ticket: TicketDetail } | { ok: false }>;
  discard(): Promise<void>;
  clearAll(): Promise<void>;
}

interface Deps {
  drafts: DraftPersistence;
  repo: TicketRepository;
  newId: () => string;
  now?: () => Date;
}

const emptyDraft = (id: string, now: Date): Draft => ({
  clientRequestId: id,
  categoryId: null,
  title: '',
  description: '',
  priority: 'normal',
  attempted: false,
  updatedAt: now.toISOString(),
});
const isBlank = (d: Draft) => !d.title.trim() && !d.description.trim() && !d.categoryId;

/** Zustand holds transient UI state only; the server remains the source of truth for tickets. */
export function createDraftStore({ drafts, repo, newId, now = () => new Date() }: Deps) {
  return create<DraftState>()((set, get) => {
    const persist = async (userId: string, d: Draft) => {
      try {
        await drafts.save(userId, d);
        if (get().persistError) set({ persistError: false });
      } catch (e) {
        logger.warn('draft_persist_failed', { error: e });
        set({ persistError: true });
      }
    };
    return {
      userId: null,
      draft: null,
      status: 'none',
      message: null,
      fieldErrors: {},
      persistError: false,

      async load(userId) {
        set({ userId, draft: null, status: 'none', message: null, fieldErrors: {} });
        try {
          const d = await drafts.get(userId);
          if (get().userId !== userId) return; // user changed while loading
          if (d)
            set({
              draft: d,
              status: d.attempted ? 'send_failed' : 'local_draft',
              message: d.attempted
                ? 'Your last attempt was not confirmed. Sending again will not create a duplicate.'
                : null,
            });
        } catch {
          set({ persistError: true });
        }
      },

      update(patch) {
        const { userId, draft, status } = get();
        if (!userId || status === 'sending') return;
        const next: Draft = {
          ...(draft ?? emptyDraft(newId(), now())),
          ...patch,
          updatedAt: now().toISOString(),
        };
        set({
          draft: next,
          status: status === 'send_failed' ? 'send_failed' : 'local_draft',
          fieldErrors: {},
        });
        void persist(userId, next);
      },

      async submit() {
        const { userId, draft, status } = get();
        if (!userId || !draft || status === 'sending') return { ok: false }; // blocks double-tap / duplicate submission
        const errors = validateDraft(draft);
        if (hasErrors(errors)) {
          set({ fieldErrors: errors, message: null });
          return { ok: false };
        }

        const attempted: Draft = { ...draft, attempted: true };
        set({ draft: attempted, status: 'sending', message: null, fieldErrors: {} });
        await persist(userId, attempted); // saved BEFORE sending so a crash mid-send keeps the same idempotency key

        const result = await repo.createTicket({
          clientRequestId: attempted.clientRequestId,
          categoryId: attempted.categoryId!,
          title: attempted.title.trim(),
          description: attempted.description.trim(),
          priority: attempted.priority,
        });
        if (get().userId !== userId) return { ok: false }; // signed out / switched user mid-flight

        if (result.ok) {
          try {
            await drafts.delete(userId);
          } catch {
            /* a stale draft is harmless: same key returns the same ticket */
          }
          set({ draft: null, status: 'none', message: null, fieldErrors: {} });
          return { ok: true, ticket: result.data };
        }
        const { kind, message } = result.error;
        if (kind === 'conflict') {
          const fresh: Draft = { ...attempted, clientRequestId: newId(), attempted: false };
          set({ draft: fresh, status: 'local_draft', message });
          await persist(userId, fresh);
        } else if (kind === 'validation' || kind === 'rate_limited') {
          const back: Draft = { ...attempted, attempted: false };
          set({ draft: back, status: 'local_draft', message });
          await persist(userId, back); // server rejected it: nothing was created, so a retry may reuse the key
        } else {
          set({ status: 'send_failed', message }); // network/unknown/forbidden: outcome unconfirmed; keep key and draft
        }
        return { ok: false };
      },

      async discard() {
        const { userId } = get();
        set({ draft: null, status: 'none', message: null, fieldErrors: {} });
        if (userId) {
          try {
            await drafts.delete(userId);
          } catch {
            set({ persistError: true });
          }
        }
      },

      async clearAll() {
        set({
          userId: null,
          draft: null,
          status: 'none',
          message: null,
          fieldErrors: {},
          persistError: false,
        });
        try {
          await drafts.deleteAll();
        } catch {
          /* nothing more to do on sign-out */
        }
      },
    };
  });
}

export const draftIsBlank = isBlank;
export type { TicketPriority };

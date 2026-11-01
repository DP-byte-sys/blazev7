import type { Draft, DraftPersistence } from '../db/draftPersistence';
import type { TicketRepository } from '../repositories/ticketRepository';
import type { TicketDetail } from '../features/tickets/types';

export function memoryDrafts(): DraftPersistence & {
  rows: Map<string, Draft>;
  failSaves: boolean;
} {
  const rows = new Map<string, Draft>();
  const self = {
    rows,
    failSaves: false,
    async get(u: string) {
      return rows.get(u) ?? null;
    },
    async save(u: string, d: Draft) {
      if (self.failSaves) throw new Error('disk full');
      rows.set(u, { ...d });
    },
    async delete(u: string) {
      rows.delete(u);
    },
    async deleteAll() {
      rows.clear();
    },
  };
  return self;
}

export const ticketFixture = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  id: 't-1',
  reference: 'BLZ-000001',
  title: 'Wi-Fi down',
  description: 'It is broken',
  status: 'new',
  priority: 'normal',
  category: '',
  updatedAt: '2026-10-29T10:00:00Z',
  createdAt: '2026-10-29T10:00:00Z',
  resolutionSummary: null,
  version: 1,
  ...over,
});

export function fakeRepo(): TicketRepository & { createTicket: jest.Mock } {
  return {
    listCategories: jest.fn(),
    listMyTickets: jest.fn(),
    getTicket: jest.fn(),
    getTimeline: jest.fn(),
    createTicket: jest.fn(),
  } as unknown as TicketRepository & { createTicket: jest.Mock };
}

export const makeIds = () => {
  let n = 0;
  return () => `key-${++n}`;
};

import * as Crypto from 'expo-crypto';
import { sqliteDrafts } from '../db/sqliteDrafts';
import { ticketRepository } from '../repositories';
import { createDraftStore } from './draftStore';

export const useDraftStore = createDraftStore({
  drafts: sqliteDrafts,
  repo: ticketRepository,
  newId: () => Crypto.randomUUID(),
});

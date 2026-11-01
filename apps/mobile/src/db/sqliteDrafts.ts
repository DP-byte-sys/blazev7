import * as SQLite from 'expo-sqlite';
import type { TicketPriority } from '../features/tickets/labels';
import type { Draft, DraftPersistence } from './draftPersistence';

// No tokens or secrets are stored here (those live in SecureStore). Draft text is cleared on sign-out.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function getDb() {
  dbPromise ??= SQLite.openDatabaseAsync('blaze.db').then(async (db) => {
    await db.execAsync(`create table if not exists ticket_drafts (
      user_id text primary key not null,
      client_request_id text not null,
      category_id text,
      title text not null,
      description text not null,
      priority text not null,
      attempted integer not null default 0,
      updated_at text not null
    )`);
    return db;
  });
  return dbPromise;
}

interface Row {
  client_request_id: string;
  category_id: string | null;
  title: string;
  description: string;
  priority: string;
  attempted: number;
  updated_at: string;
}

export const sqliteDrafts: DraftPersistence = {
  async get(userId) {
    const db = await getDb();
    const r = await db.getFirstAsync<Row>('select * from ticket_drafts where user_id = ?', [
      userId,
    ]);
    if (!r) return null;
    return {
      clientRequestId: r.client_request_id,
      categoryId: r.category_id,
      title: r.title,
      description: r.description,
      priority: r.priority as TicketPriority,
      attempted: r.attempted === 1,
      updatedAt: r.updated_at,
    };
  },
  async save(userId, d) {
    const db = await getDb();
    await db.runAsync(
      'insert or replace into ticket_drafts (user_id, client_request_id, category_id, title, description, priority, attempted, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        d.clientRequestId,
        d.categoryId,
        d.title,
        d.description,
        d.priority,
        d.attempted ? 1 : 0,
        d.updatedAt,
      ],
    );
  },
  async delete(userId) {
    const db = await getDb();
    await db.runAsync('delete from ticket_drafts where user_id = ?', [userId]);
  },
  async deleteAll() {
    const db = await getDb();
    await db.runAsync('delete from ticket_drafts');
  },
};

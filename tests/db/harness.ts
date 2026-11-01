import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');

// Minimal stand-in for what Supabase provides: API roles, auth.users and auth.uid().
// The real thing must still be verified with `supabase db reset` (see memory.md).
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
`;

export const U = {
  req1: '11111111-1111-1111-1111-111111111111',
  req2: '22222222-2222-2222-2222-222222222222',
  agentNet: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  agentIt: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  supervisor: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  admin: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  inactiveAgent: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
} as const;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(supabaseDir, 'migrations');
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.exec(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  // Rate limits are exercised explicitly in ops.test.ts; the other suites create many tickets as one user, so lift them here.
  await db.exec('update public.rate_limits set max_count = 100000');
  return db;
}

/** Run fn as an API user (authenticated + JWT sub), or as anon when uid is null. */
export async function as<T>(
  db: PGlite,
  uid: string | null | 'service',
  fn: () => Promise<T>,
): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    uid && uid !== 'service' ? uid : '',
  ]);
  await db.exec(`set role ${uid === 'service' ? 'service_role' : uid ? 'authenticated' : 'anon'}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

export interface Ticket {
  id: string;
  version: number;
  status: string;
  assignee_id: string | null;
  team_id: string | null;
  reference: string;
}

export async function categoryId(db: PGlite, name: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    'select id from public.ticket_categories where name = $1',
    [name],
  );
  return r.rows[0]!.id;
}
export async function teamId(db: PGlite, name: string): Promise<string> {
  const r = await db.query<{ id: string }>('select id from public.teams where name = $1', [name]);
  return r.rows[0]!.id;
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

/** Creates a ticket as `uid` through the trusted function. */
export async function createTicket(
  db: PGlite,
  uid: string,
  category = 'Network',
  title = 'Test ticket',
): Promise<Ticket> {
  const cat = await categoryId(db, category);
  return as(db, uid, async () => {
    const r = await db.query<Ticket>('select * from public.create_ticket($1, $2, $3, $4)', [
      uuid(),
      cat,
      title,
      'Something is broken',
    ]);
    return r.rows[0]!;
  });
}

export const call = async <T = Record<string, unknown>>(
  db: PGlite,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
) => as(db, uid, async () => (await db.query<T>(sql, params)).rows);

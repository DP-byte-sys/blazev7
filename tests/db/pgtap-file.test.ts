import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb } from './harness';

// The real pgTAP file runs in CI on a real Supabase stack. Here the same file is executed against our in-memory database
// with a tiny stand-in for the five pgTAP functions it uses, so mistakes in the fixtures, the impersonation helper or the
// expectations are caught on every local test run instead of only in CI.
const file = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'supabase',
    'tests',
    'database',
    '01_security_smoke.test.sql',
  ),
  'utf8',
);

const SHIM = `
  create schema tap_shim;
  create table tap_shim.tap_results (id serial primary key, ok boolean not null, descr text);
  create function public.plan(n integer) returns text language plpgsql as $$ begin perform set_config('tap.plan', n::text, true); return '1..' || n; end $$;
  create function public.is(got text, want text, descr text default '') returns text language plpgsql as $$
  begin
    insert into tap_shim.tap_results (ok, descr) values (got is not distinct from want, descr || case when got is distinct from want then ' [got ' || coalesce(got, 'NULL') || ', wanted ' || coalesce(want, 'NULL') || ']' else '' end);
    return 'x';
  end $$;
  create function public.finish() returns setof text language plpgsql as $$
  declare failed integer; total integer; planned integer := current_setting('tap.plan', true)::integer;
  begin
    select count(*) into total from tap_shim.tap_results;
    select count(*) into failed from tap_shim.tap_results where not ok;
    if failed > 0 then raise exception 'pgTAP stand-in: % failed: %', failed, (select string_agg(descr, '; ') from tap_shim.tap_results where not ok); end if;
    if total <> planned then raise exception 'pgTAP stand-in: planned % but ran %', planned, total; end if;
    return next 'ok';
  end $$;
`;

describe('supabase/tests/database/01_security_smoke.test.sql', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
    await db.exec(SHIM);
  });
  afterAll(async () => {
    await db.close();
  });

  it('all 15 expectations hold (and the file only uses plan, is and finish)', async () => {
    expect(
      file
        .match(/\b(plan|ok|is|isnt|throws_ok|lives_ok|has_function|finish)\(/g)
        ?.filter((f) => !/^(plan|is|finish)\(/.test(f)) ?? [],
    ).toEqual([]);
    await expect(db.exec(file)).resolves.toBeDefined();
  });

  it('leaves nothing behind (the file rolls back)', async () => {
    const r = await db.query<{ c: number }>(
      `select count(*)::int as c from auth.users where email like 'pgtap.%'`,
    );
    expect(r.rows[0]!.c).toBe(0);
  });
});

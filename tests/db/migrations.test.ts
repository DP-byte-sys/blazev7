import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('migration hygiene', () => {
  it('every file is named <14-digit version>_<snake_case>.sql', () => {
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it('versions are unique (a duplicate version breaks `supabase db push`)', () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('versions only ever increase in file order', () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect([...versions].sort()).toEqual(versions);
  });

  it('contains no destructive statements (drop table/column/schema, truncate) without explicit approval', () => {
    // Per memory.md: no destructive migration without explicit approval and a recovery plan. Add an allowlist entry here when one is approved.
    const approved: string[] = [];
    for (const f of files) {
      if (approved.includes(f)) continue;
      const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
      expect(sql, f).not.toMatch(/\bdrop\s+(table|column|schema)\b|\btruncate\b/i);
    }
  });
});

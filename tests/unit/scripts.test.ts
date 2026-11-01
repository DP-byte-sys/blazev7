import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM scripts without type declarations
import { scanRepo, scanText } from '../../scripts/scan-secrets.mjs';
// @ts-expect-error plain ESM scripts without type declarations
import { checkRecord, parseRecord } from '../../scripts/check-release-record.mjs';
// @ts-expect-error plain ESM scripts without type declarations
import { allPassed, checkApi, checkWeb } from '../../scripts/smoke.mjs';

// Token-shaped strings are assembled at runtime so this file never trips the scanner itself.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) =>
  [
    'eyJ' + b64({ alg: 'HS256', typ: 'JWT' }).slice(3),
    b64({ iss: 'supabase', role }),
    'c2lnbmF0dXJlLXZhbHVl',
  ].join('.');

describe('secret scanner', () => {
  it('flags a service-role JWT, an unknown JWT, secret-key prefixes, private keys and AWS ids', () => {
    expect(scanText('a.ts', `const k = '${jwt('service_role')}'`)[0]).toMatchObject({
      rule: 'jwt',
      why: expect.stringContaining('service-role'),
    });
    expect(scanText('a.ts', `const t = '${jwt('authenticated')}'`)[0]).toMatchObject({
      rule: 'jwt',
    });
    expect(scanText('a.ts', 'key=' + 'sb_' + 'secret_' + 'abcdefgh12345678')[0]).toMatchObject({
      rule: 'secret-key-prefix',
    });
    expect(scanText('k.txt', '-----BEGIN ' + 'PRIVATE KEY-----')[0]).toMatchObject({
      rule: 'private-key-block',
    });
    expect(scanText('a.ts', 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP')[0]).toMatchObject({
      rule: 'aws-access-key',
    });
  });
  it('allows the public anon key and publishable keys', () => {
    expect(scanText('.env.example', `KEY=${jwt('anon')}`)).toEqual([]);
    expect(
      scanText('docs.md', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc123'),
    ).toEqual([]);
  });
  it('flags a service-role value, service-role use inside apps, and remote database URLs with passwords', () => {
    expect(
      scanText('x.env', 'SUPABASE_SERVICE_ROLE_KEY=' + 'abcdefghijklmnopqrstuvwxyz')[0],
    ).toMatchObject({ rule: 'service-role-assignment' });
    expect(
      scanText('apps/web/src/a.ts', 'const k = import.meta.env.VITE_SERVICE_ROLE_KEY;')[0],
    ).toMatchObject({ rule: 'service-role-in-app' });
    expect(scanText('scripts/a.mjs', 'const k = process.env.SERVICE_ROLE_KEY;')).toEqual([]); // server-side scripts may read it from the environment
    expect(
      scanText(
        'a.md',
        ['postgresql://postgres', 'hunter2pw@db.abcd.supabase.co:5432/postgres'].join(':'),
      )[0],
    ).toMatchObject({ rule: 'database-url-with-password' });
    expect(scanText('a.md', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toEqual([]);
  });
  it('never repeats the secret in its findings', () => {
    const secret = jwt('service_role');
    expect(JSON.stringify(scanText('a.ts', `k='${secret}'`))).not.toContain(secret);
  });
  it('flags tracked .env and key files in a git checkout, but not .env.example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-'));
    try {
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, '.env'), 'A=1');
      writeFileSync(join(dir, '.env.example'), 'A=');
      writeFileSync(join(dir, 'upload.keystore'), 'x');
      // not a real git repo, so scanRepo falls back to walking; the filename rules apply only to tracked files
      const findings = scanRepo(dir);
      expect(findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('the Blaze repository itself has no findings', () => {
    expect(scanRepo(join(__dirname, '..', '..'))).toEqual([]);
  });
});

const GOOD_PROD = `
Version: v1.0.0
Git commit: 1a2b3c4d5e6f
UAT accepted by: Ada Owner on 2026-11-02
UAT scenarios recorded: yes
Open critical/high security defects: 0
Staging smoke: PASSED on 2026-11-03
Recovery rehearsal: PASSED on 2026-11-03
Pre-release backup: yes, dump stored offline
Rollback plan: redeploy v0.9.0 web build; migrations are forward-fix only
Production approved by: Ada Owner on 2026-11-04
`;
const opts = (stage: string, extra: object = {}) => ({
  stage,
  version: 'v1.0.0',
  commit: '1a2b3c4d5e6f7a8b9c0d',
  ...extra,
});

describe('release record gate', () => {
  it('parses "Key: value" lines (with or without bullets)', () => {
    expect(parseRecord('- Version: v1.0.0\nGit commit:  abc1234  ').get('git commit')).toBe(
      'abc1234',
    );
  });
  it('accepts a complete production record', () => {
    expect(checkRecord(GOOD_PROD, opts('production'))).toEqual({ ok: true, problems: [] });
  });
  it('uat only needs version and commit', () => {
    expect(checkRecord('Version: v1.0.0\nGit commit: 1a2b3c4', opts('uat')).ok).toBe(true);
  });
  it('staging requires UAT evidence and zero open security defects', () => {
    const noUat = GOOD_PROD.replace(/UAT accepted by:.*\n/, '');
    expect(checkRecord(noUat, opts('staging')).problems.join()).toMatch(/UAT accepted by/);
    const defects = GOOD_PROD.replace('defects: 0', 'defects: 2');
    expect(checkRecord(defects, opts('staging')).problems.join()).toMatch(/must be 0/);
  });
  it('rejects the untouched template (placeholders)', () => {
    const tpl = 'Version: v1.0.0\nGit commit: <sha>\nUAT accepted by: <name> on <date>\n';
    expect(checkRecord(tpl, opts('staging')).ok).toBe(false);
  });
  it('production requires staging smoke, recovery rehearsal, backup, rollback plan and an approval', () => {
    for (const key of [
      'Staging smoke',
      'Recovery rehearsal',
      'Pre-release backup',
      'Rollback plan',
      'Production approved by',
    ]) {
      const missing = GOOD_PROD.split('\n')
        .filter((l) => !l.startsWith(key))
        .join('\n');
      expect(checkRecord(missing, opts('production')).ok, key).toBe(false);
    }
  });
  it('rejects a failed smoke check and a vague rollback plan', () => {
    expect(
      checkRecord(
        GOOD_PROD.replace('PASSED on 2026-11-03\nRecovery', 'FAILED on 2026-11-03\nRecovery'),
        opts('production'),
      ).ok,
    ).toBe(false);
    expect(
      checkRecord(
        GOOD_PROD.replace(/Rollback plan:.*/, 'Rollback plan: revert'),
        opts('production'),
      ).problems.join(),
    ).toMatch(/Rollback plan/);
  });
  it('rejects out-of-order dates (approval before UAT)', () => {
    const bad = GOOD_PROD.replace('Ada Owner on 2026-11-04', 'Ada Owner on 2026-11-01');
    expect(checkRecord(bad, opts('production')).problems.join()).toMatch(/out of order/);
  });
  it('refuses to deploy a different version or commit than the record describes', () => {
    expect(
      checkRecord(GOOD_PROD, opts('production', { version: 'v1.0.1' })).problems.join(),
    ).toMatch(/Version/);
    expect(
      checkRecord(GOOD_PROD, opts('production', { commit: 'ffffffffffff' })).problems.join(),
    ).toMatch(/commit/);
  });
  it('rejects an unknown stage', () => {
    expect(checkRecord(GOOD_PROD, opts('dev')).ok).toBe(false);
  });
});

const html =
  '<!doctype html><html><head><script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-abc.css"></head><body><div id="root"></div></body></html>';
const goodHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'referrer-policy': 'same-origin',
};
type Handler = (url: string, init?: RequestInit) => Response;
const fakeFetch = (h: Handler) =>
  (async (url: string, init?: RequestInit) => h(String(url), init)) as unknown as typeof fetch;
const goodWeb: Handler = (url) => {
  if (url.endsWith('.js'))
    return new Response('console.log(1)', {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
    });
  if (url.endsWith('.css'))
    return new Response('a{}', { status: 200, headers: { 'content-type': 'text/css' } });
  return new Response(html, { status: 200, headers: goodHeaders });
};

describe('smoke checks: web', () => {
  it('passes for a healthy deployment', async () => {
    const r = await checkWeb('https://blaze-uat.example.dev', fakeFetch(goodWeb));
    expect(r.filter((x: { ok: boolean }) => !x.ok)).toEqual([]);
    expect(allPassed(r)).toBe(true);
  });
  it('fails on plain http, missing security headers, broken assets and no SPA fallback', async () => {
    const bad: Handler = (url) => {
      if (url.endsWith('.js'))
        return new Response('<html>not found</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      if (url.includes('__smoke__')) return new Response('Not found', { status: 404 });
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const r = await checkWeb('http://blaze.example.dev', fakeFetch(bad));
    const failed = r
      .filter((x: { ok: boolean }) => !x.ok)
      .map((x: { name: string }) => x.name)
      .join(' | ');
    expect(failed).toMatch(/https/);
    expect(failed).toMatch(/asset \/assets\/index-abc\.js/);
    expect(failed).toMatch(/deep links/);
    expect(failed).toMatch(/nosniff/);
    expect(failed).toMatch(/clickjacking/);
    expect(allPassed(r)).toBe(false);
  });
  it('reports an unreachable site instead of throwing', async () => {
    const r = await checkWeb('https://down.example.dev', (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    expect(allPassed(r)).toBe(false);
  });
});

describe('smoke checks: api (read-only, publishable key only)', () => {
  const secure: Handler = (url, init) => {
    if (url.endsWith('/auth/v1/health')) return new Response('{"status":"ok"}', { status: 200 });
    if (init?.method === 'POST') return new Response('{"code":"42501"}', { status: 401 });
    return new Response('{"code":"42501","message":"permission denied"}', { status: 401 });
  };
  it('passes when anonymous access is refused everywhere', async () => {
    const r = await checkApi(
      { supabaseUrl: 'https://x.supabase.co/', key: 'sb_publishable_x' },
      fakeFetch(secure),
    );
    expect(allPassed(r)).toBe(true);
    expect(r.length).toBeGreaterThan(10);
  });
  it('sends only the apikey header (never a service key) and never writes data', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await checkApi(
      { supabaseUrl: 'https://x.supabase.co', key: 'sb_publishable_x' },
      fakeFetch((url, init) => {
        seen.push({ url, init });
        return secure(url, init);
      }),
    );
    for (const s of seen)
      expect(
        Object.keys((s.init?.headers ?? {}) as object).filter(
          (k) => !['apikey', 'content-type'].includes(k),
        ),
      ).toEqual([]);
    expect(seen.filter((s) => s.init?.method === 'POST').every((s) => /\/rpc\//.test(s.url))).toBe(
      true,
    );
  });
  it('FAILS when anonymous users can read rows or call a function', async () => {
    const leaky: Handler = (url, init) => {
      if (url.includes('/rest/v1/tickets')) return new Response('[{"id":"1"}]', { status: 200 });
      if (url.includes('/rpc/claim_notifications')) return new Response('[]', { status: 200 });
      return secure(url, init);
    };
    const r = await checkApi({ supabaseUrl: 'https://x.supabase.co', key: 'k' }, fakeFetch(leaky));
    const failed = r.filter((x: { ok: boolean }) => !x.ok).map((x: { name: string }) => x.name);
    expect(failed).toEqual([
      'anonymous cannot read tickets',
      'anonymous cannot call claim_notifications',
    ]);
  });
  it('FAILS when even an empty 200 comes back (table exposed to the anonymous role)', async () => {
    const exposed: Handler = (url, init) =>
      url.includes('/rest/v1/profiles') ? new Response('[]', { status: 200 }) : secure(url, init);
    const r = await checkApi(
      { supabaseUrl: 'https://x.supabase.co', key: 'k' },
      fakeFetch(exposed),
    );
    expect(r.filter((x: { ok: boolean }) => !x.ok).map((x: { name: string }) => x.name)).toEqual([
      'anonymous cannot read profiles',
    ]);
  });
});

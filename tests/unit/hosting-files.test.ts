import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) =>
  readFileSync(join(__dirname, '..', '..', 'apps', 'web', 'public', f), 'utf8');

describe('static hosting files (apps/web/public)', () => {
  it('serves the app for deep links such as /tickets/123 on refresh', () => {
    expect(read('_redirects')).toMatch(/\/\*\s+\/index\.html\s+200/);
  });
  it('sends the security headers the smoke test expects', () => {
    const h = read('_headers');
    for (const needle of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy:',
      'frame-ancestors',
      "default-src 'self'",
      "script-src 'self'",
      'connect-src',
    ]) {
      expect(h).toContain(needle);
    }
  });
  it('allows no inline or eval scripts and only Supabase as an external API host', () => {
    const csp =
      read('_headers')
        .split('\n')
        .find((l) => l.includes('Content-Security-Policy')) ?? '';
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp.match(/https?:\/\/[^\s;]+/g)).toEqual(['https://*.supabase.co']);
  });
});

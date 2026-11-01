#!/usr/bin/env node
// Safe post-deploy smoke checks. READ-ONLY: only GET requests (and one POST that must be rejected) using the PUBLISHABLE key.
// Env: SMOKE_WEB_URL (optional), SMOKE_SUPABASE_URL + SMOKE_SUPABASE_KEY (optional). Exit code 1 when any check fails.
import { pathToFileURL } from 'node:url';

const result = (name, ok, detail = '') => ({ name, ok, detail });
const trim = (u) => u.replace(/\/+$/, '');

/** Is the status a refusal (not a success)? 404 counts: an object hidden from the API role is a refusal. */
const refused = (status) => status === 401 || status === 403 || status === 404;

export async function checkWeb(baseUrl, fetchFn = fetch) {
  const base = trim(baseUrl);
  const out = [];
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);
  out.push(
    result(
      'web uses https',
      base.startsWith('https://') || isLocal,
      base.startsWith('https://') || isLocal ? '' : 'plain http',
    ),
  );

  let home;
  try {
    home = await fetchFn(`${base}/`);
  } catch (e) {
    return [...out, result('web home page loads', false, `request failed (${e?.name ?? 'error'})`)];
  }
  const html = await home.text();
  out.push(
    result(
      'web home page loads',
      home.status === 200 &&
        /text\/html/i.test(home.headers.get('content-type') ?? '') &&
        html.includes('id="root"'),
      `status ${home.status}`,
    ),
  );

  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  out.push(
    result(
      'web references app assets',
      assets.length > 0,
      assets.length ? '' : 'no script/style found in index.html',
    ),
  );
  for (const a of assets.slice(0, 6)) {
    const url = a.startsWith('http') ? a : `${base}${a.startsWith('/') ? '' : '/'}${a}`;
    try {
      const r = await fetchFn(url);
      const type = r.headers.get('content-type') ?? '';
      out.push(
        result(
          `asset ${a}`,
          r.status === 200 && !/text\/html/i.test(type),
          `status ${r.status}, ${type || 'no content-type'}`,
        ),
      );
    } catch (e) {
      out.push(result(`asset ${a}`, false, `request failed (${e?.name ?? 'error'})`));
    }
  }

  try {
    const spa = await fetchFn(`${base}/tickets/__smoke__`);
    const body = await spa.text();
    out.push(
      result(
        'web deep links fall back to the app',
        spa.status === 200 && body.includes('id="root"'),
        `status ${spa.status}`,
      ),
    );
  } catch (e) {
    out.push(
      result(
        'web deep links fall back to the app',
        false,
        `request failed (${e?.name ?? 'error'})`,
      ),
    );
  }

  const h = home.headers;
  out.push(
    result(
      'header x-content-type-options: nosniff',
      (h.get('x-content-type-options') ?? '').toLowerCase() === 'nosniff',
    ),
  );
  out.push(
    result(
      'clickjacking protection (frame-ancestors or x-frame-options)',
      /frame-ancestors/i.test(h.get('content-security-policy') ?? '') || !!h.get('x-frame-options'),
    ),
  );
  out.push(result('header referrer-policy present', !!h.get('referrer-policy')));
  return out;
}

const DENIED_TABLES = [
  'tickets',
  'ticket_events',
  'ticket_comments',
  'profiles',
  'notification_outbox',
  'rate_limits',
  'admin_audit_events',
];
const DENIED_RPCS = [
  'claim_notifications',
  'complete_notification',
  'create_ticket',
  'admin_set_user_role',
];

export async function checkApi({ supabaseUrl, key }, fetchFn = fetch) {
  const base = trim(supabaseUrl);
  const headers = { apikey: key };
  const out = [];
  try {
    const health = await fetchFn(`${base}/auth/v1/health`, { headers });
    out.push(result('auth service is healthy', health.status === 200, `status ${health.status}`));
  } catch (e) {
    out.push(result('auth service is healthy', false, `request failed (${e?.name ?? 'error'})`));
  }

  // With only the publishable key (no signed-in user) nothing may be readable or callable.
  for (const t of DENIED_TABLES) {
    try {
      const r = await fetchFn(`${base}/rest/v1/${t}?select=*&limit=1`, { headers });
      const body = await r.text();
      let leaked = false;
      try {
        const j = JSON.parse(body);
        leaked = Array.isArray(j) && j.length > 0;
      } catch {
        /* not JSON: fine */
      }
      out.push(
        result(
          `anonymous cannot read ${t}`,
          refused(r.status) && !leaked,
          `status ${r.status}${leaked ? ' and rows were returned' : ''}`,
        ),
      );
    } catch (e) {
      out.push(
        result(`anonymous cannot read ${t}`, false, `request failed (${e?.name ?? 'error'})`),
      );
    }
  }
  for (const fn of DENIED_RPCS) {
    try {
      const r = await fetchFn(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{}',
      });
      out.push(result(`anonymous cannot call ${fn}`, refused(r.status), `status ${r.status}`));
    } catch (e) {
      out.push(
        result(`anonymous cannot call ${fn}`, false, `request failed (${e?.name ?? 'error'})`),
      );
    }
  }
  return out;
}

export const allPassed = (results) => results.length > 0 && results.every((r) => r.ok);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { SMOKE_WEB_URL: web, SMOKE_SUPABASE_URL: sb, SMOKE_SUPABASE_KEY: key } = process.env;
  if (!web && !(sb && key)) {
    console.error(
      'Set SMOKE_WEB_URL and/or SMOKE_SUPABASE_URL + SMOKE_SUPABASE_KEY (publishable key only).',
    );
    process.exit(2);
  }
  const results = [];
  if (web) results.push(...(await checkWeb(web)));
  if (sb && key) results.push(...(await checkApi({ supabaseUrl: sb, key })));
  for (const r of results)
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed
      ? `\n${failed} of ${results.length} checks FAILED`
      : `\nall ${results.length} checks passed`,
  );
  process.exit(failed ? 1 : 0);
}

#!/usr/bin/env node
// Fails when secrets or secret-looking files are about to be committed or shipped.
// Public values (Supabase publishable / legacy "anon" keys) are allowed; everything else that looks like a key is not.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.expo', 'coverage', 'build', '.turbo']);
const SKIP_FILE =
  /(^|\/)(package-lock\.json)$|\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|zip|pdf|hbc)$/i;
const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const KEY_FILE = /\.(pem|p12|p8|key|jks|keystore|mobileprovision)$/i;

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}\b/g;

const RULES = [
  { id: 'secret-key-prefix', re: /\bsb_secret_[A-Za-z0-9_-]{8,}/, why: 'Supabase secret key' },
  {
    id: 'private-key-block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    why: 'private key',
  },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id' },
  {
    id: 'service-role-assignment',
    re: /SERVICE_ROLE(?:_KEY)?\s*[=:]\s*['"]?[A-Za-z0-9._-]{20,}/,
    why: 'a service-role key is assigned a value',
  },
  {
    id: 'service-role-in-app',
    re: /(?:process\.env|import\.meta\.env)\.[A-Z_]*SERVICE_ROLE/,
    why: 'service-role key referenced from app code',
    onlyPaths: /^apps\//,
  },
  {
    id: 'database-url-with-password',
    re: /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]{3,}@(?!localhost|127\.0\.0\.1|host\.docker\.internal)[^\s'"]+/,
    why: 'database connection string with a password',
  },
];

function jwtRole(payloadB64) {
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/** Scan one file's text. Returns findings with line numbers; never includes the secret itself. */
export function scanText(path, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.onlyPaths && !rule.onlyPaths.test(path)) continue;
      if (rule.re.test(line)) findings.push({ path, line: i + 1, rule: rule.id, why: rule.why });
    }
    for (const m of line.matchAll(JWT)) {
      const role = jwtRole(m[1]);
      if (role === 'anon') continue; // the legacy public key: safe to ship by design
      findings.push({
        path,
        line: i + 1,
        rule: 'jwt',
        why:
          role === 'service_role'
            ? 'service-role key (full database access)'
            : 'a JWT (token or key); only public anon keys may be committed',
      });
    }
  });
  return findings;
}

function listFiles(root) {
  if (existsSync(join(root, '.git'))) {
    try {
      const out = execFileSync('git', ['ls-files', '-z'], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
      }).toString('utf8');
      return { files: out.split('\0').filter(Boolean), tracked: true };
    } catch {
      /* fall through to a directory walk */
    }
  }
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(root);
  return { files, tracked: false };
}

/** Scan the repository (tracked files when in a git checkout, otherwise every file except build output). */
export function scanRepo(root = process.cwd()) {
  const { files, tracked } = listFiles(root);
  const findings = [];
  for (const f of files) {
    if (!existsSync(join(root, f))) continue; // deleted but still listed
    if (tracked && ENV_FILE.test(f) && !/\.env\.example$/.test(f))
      findings.push({
        path: f,
        line: 0,
        rule: 'env-file',
        why: 'a real .env file is tracked by git',
      });
    if (tracked && KEY_FILE.test(f))
      findings.push({
        path: f,
        line: 0,
        rule: 'key-file',
        why: 'a key/certificate file is tracked by git',
      });
    if (SKIP_FILE.test(f) || (!tracked && ENV_FILE.test(f))) continue; // local .env files are git-ignored, so not a leak by themselves
    let text;
    try {
      text = readFileSync(join(root, f), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue; // binary
    findings.push(...scanText(f, text));
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = scanRepo(process.cwd());
  if (findings.length === 0) {
    console.log('secret scan: no findings');
  } else {
    console.error(
      `secret scan: ${findings.length} finding(s). Remove the value, rotate it if it was ever pushed, and use a secret store instead.`,
    );
    for (const f of findings)
      console.error(`  ${f.path}${f.line ? `:${f.line}` : ''}  [${f.rule}] ${f.why}`);
    process.exit(1);
  }
}

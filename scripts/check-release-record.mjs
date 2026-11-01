#!/usr/bin/env node
// Release gate: a release may move to staging/production only when its record (docs/releases/<version>.md)
// shows the required evidence. This is a PROCEDURAL control (a person fills the record in); the script makes
// skipping a step visible and blocks the deploy workflow when evidence is missing or inconsistent.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DATE = /\d{4}-\d{2}-\d{2}/;
const NAME_ON_DATE = new RegExp(`^(.{2,}?)\\s+on\\s+(${DATE.source})$`);
const PASSED_ON = new RegExp(`^PASSED on (${DATE.source})$`, 'i');
const VERSION = /^v\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/;

export function parseRecord(text) {
  const fields = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z0-9 /()'-]*?):\s*(.*?)\s*$/);
    if (m) fields.set(m[1].trim().toLowerCase(), m[2]);
  }
  return fields;
}

const isPlaceholder = (v) => !v || /[<>]/.test(v) || /\b(todo|tbd|fill in)\b/i.test(v);

/** @returns {{ ok: boolean, problems: string[] }} */
export function checkRecord(text, { stage, version, commit }) {
  const f = parseRecord(text);
  const problems = [];
  const need = (key, label = key) => {
    const v = f.get(key.toLowerCase());
    if (isPlaceholder(v)) {
      problems.push(`"${label}" is missing or still a placeholder`);
      return null;
    }
    return v;
  };

  if (!['uat', 'staging', 'production'].includes(stage))
    return { ok: false, problems: [`unknown stage "${stage}"`] };
  const v = need('Version');
  if (v && v !== version)
    problems.push(`record says Version ${v} but you are releasing ${version}`);
  const sha = need('Git commit');
  if (sha && !/^[0-9a-f]{7,40}$/i.test(sha))
    problems.push('"Git commit" must be a 7-40 character commit id');
  if (
    sha &&
    commit &&
    !(
      commit.toLowerCase().startsWith(sha.toLowerCase()) ||
      sha.toLowerCase().startsWith(commit.toLowerCase())
    )
  ) {
    problems.push(`the record is for commit ${sha} but the workflow is deploying ${commit}`);
  }
  if (stage === 'uat') return { ok: problems.length === 0, problems };

  // staging needs UAT evidence
  const uat = need('UAT accepted by');
  const uatMatch = uat?.match(NAME_ON_DATE);
  if (uat && !uatMatch) problems.push('"UAT accepted by" must look like "Name on YYYY-MM-DD"');
  const scenarios = need('UAT scenarios recorded');
  if (scenarios && scenarios.toLowerCase() !== 'yes')
    problems.push('"UAT scenarios recorded" must be "yes"');
  const defects = need('Open critical/high security defects');
  if (defects && defects !== '0') problems.push('"Open critical/high security defects" must be 0');
  if (stage === 'staging') return { ok: problems.length === 0, problems };

  // production needs staging evidence and an explicit approval
  const smoke = need('Staging smoke');
  const smokeMatch = smoke?.match(PASSED_ON);
  if (smoke && !smokeMatch) problems.push('"Staging smoke" must look like "PASSED on YYYY-MM-DD"');
  const recovery = need('Recovery rehearsal');
  const recoveryMatch = recovery?.match(PASSED_ON);
  if (recovery && !recoveryMatch)
    problems.push('"Recovery rehearsal" must look like "PASSED on YYYY-MM-DD"');
  const backup = need('Pre-release backup');
  if (backup && !/^(yes|done)\b/i.test(backup))
    problems.push('"Pre-release backup" must start with "yes" or "done"');
  const rollback = need('Rollback plan');
  if (rollback && rollback.length < 20)
    problems.push('"Rollback plan" needs a real description (at least 20 characters)');
  const approval = need('Production approved by');
  const approvalMatch = approval?.match(NAME_ON_DATE);
  if (approval && !approvalMatch)
    problems.push('"Production approved by" must look like "Name on YYYY-MM-DD"');

  const dates = [uatMatch?.[2], smokeMatch?.[1], recoveryMatch?.[1], approvalMatch?.[2]];
  if (dates.every(Boolean)) {
    const [u, s, r, a] = dates;
    if (!(u <= s && u <= r && s <= a && r <= a))
      problems.push(
        'dates are out of order: UAT must come before staging checks, and approval after all of them',
      );
  }
  return { ok: problems.length === 0, problems };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = arg('version');
  const stage = arg('stage');
  const dir = arg('dir') ?? 'docs/releases';
  if (!version || !VERSION.test(version) || !stage) {
    console.error(
      'usage: check-release-record --version v1.2.3 --stage uat|staging|production [--commit <sha>] [--dir docs/releases]',
    );
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(join(dir, `${version}.md`), 'utf8');
  } catch {
    console.error(
      `release record ${join(dir, `${version}.md`)} not found. Copy docs/releases/TEMPLATE.md and fill it in.`,
    );
    process.exit(1);
  }
  const { ok, problems } = checkRecord(text, { stage, version, commit: arg('commit') });
  if (ok) console.log(`release record for ${version} is complete for ${stage}`);
  else {
    console.error(`release record for ${version} is NOT ready for ${stage}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

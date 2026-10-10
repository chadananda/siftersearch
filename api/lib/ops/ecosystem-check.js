// PM2 ecosystem validation (10-10 outage: one app's `max_restarts: -1` made PM2 6 reject the WHOLE file and start
// nothing; the updater's delete+start fallback then left the API, writer and deep-research deleted for 30 minutes).
// Pure: checks a loaded config object. Used by tests/ops/ecosystem.test.js (before commit) and by the updater (before it
// touches any process). Returns a list of problems; empty = safe to apply.
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
import { createRequire } from 'module';

/** The services the site cannot run without — must be declared, in their expected mode. */
export const CRITICAL_APPS = Object.freeze({
  'siftersearch-api': { exec_mode: 'cluster' },
  'siftersearch-worker': {},
  'siftersearch-deep-research': {},
  'siftersearch-updater': {},
  'cloudflared-tunnel': {},
  'siftersearch-s3': {},
});
// PM2's own field schema (copied from pm2 6.0.14 lib/API/schema.json — refresh with tower's pm2 when it upgrades):
// type, regex and min per field. Checking against it means a file passes here iff PM2 would accept it.
const require = createRequire(import.meta.url);
const SCHEMA = require('./pm2-schema.json');
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
function fieldProblem(key, v) {
  const rule = SCHEMA[key];
  if (!rule || v == null) return null;
  const types = [].concat(rule.type || []);
  if (types.length && !types.includes(typeOf(v)) && !(types.includes('object') && typeOf(v) === 'array')) return `${key}: type ${typeOf(v)}, PM2 wants ${types.join('|')}`;
  if (rule.regex && typeof v === 'string' && !new RegExp(rule.regex).test(v)) return `${key}: '${v}' does not match PM2's pattern ${rule.regex}`;
  if (typeof rule.min === 'number' && typeof v === 'number' && v < rule.min) return `${key}: ${v} is below PM2's minimum ${rule.min}`;
  return null;
}
export function validateEcosystem(config, { root = process.cwd(), checkFiles = true } = {}) {
  const problems = [];
  const apps = config?.apps;
  if (!Array.isArray(apps) || !apps.length) return ['config has no apps array'];
  const seen = new Set();
  for (const [i, a] of apps.entries()) {
    const at = a?.name ? `app '${a.name}'` : `app #${i}`;
    if (!a?.name) problems.push(`${at}: missing name`);
    else if (seen.has(a.name)) problems.push(`${at}: duplicate name`);
    else seen.add(a.name);
    if (!a?.script) problems.push(`${at}: missing script`);
    for (const [k, v] of Object.entries(a || {})) {
      const p = fieldProblem(k, v);
      if (p) problems.push(`${at}: ${p} — PM2 rejects the whole file`);
    }
    if (a?.wait_ready && !(a.listen_timeout > 0)) problems.push(`${at}: wait_ready without a listen_timeout can hang a reload`);
    if (checkFiles && a?.script && !/^(\/usr|\/bin)/.test(a.script)) {
      const p = isAbsolute(a.script) ? a.script : join(a.cwd || root, a.script);
      // only scripts this repo owns are checked (apps of other projects on the box live elsewhere)
      if (p.startsWith(root) && !existsSync(p)) problems.push(`${at}: script not found: ${p}`);
    }
  }
  for (const [name, want] of Object.entries(CRITICAL_APPS)) {
    const a = apps.find((x) => x?.name === name);
    if (!a) { problems.push(`critical app '${name}' is not declared`); continue; }
    if (want.exec_mode && a.exec_mode !== want.exec_mode) problems.push(`critical app '${name}': exec_mode must be '${want.exec_mode}'`);
  }
  return problems;
}

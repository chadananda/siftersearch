// A push touching only what no pm2 process loads is pulled without a reload (10-19: a script-only push killed Anís answers).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { touchesRuntime, SHARED_WITH_TOWER } from '../../scripts/lib/runtime-files.js';

describe('updater: runtime files', () => {
  it('tests, docs, frontend, markdown and hand-run scripts need no reload', () => {
    expect(touchesRuntime(['scripts/anis/research-battery.mjs', 'tests/api/x.test.js', 'src/pages/a.astro', 'worker/mail/letter.js', 'api/lib/CLAUDE.md', 'planning/x.md'])).toBe(false);
  });
  it('API code, config, package.json, env and pm2-run scripts do', () => {
    for (const f of ['api/lib/assistant/respond.js', 'package.json', '.env-public', 'ecosystem.config.cjs', 'scripts/audit/audit-exchanges.mjs', 'scripts/update-server.js', 'config/sites.example.yaml'])
      expect(touchesRuntime(['docs/a.md', f])).toBe(true);
    expect(touchesRuntime([])).toBe(true);
  });
  it('every worker/ module that tower code imports is runtime (10-31: a worker/queue/core.js push reloaded nothing)', () => {
    const root = resolve(import.meta.dirname, '../..'), found = new Set();
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(n)) for (const m of readFileSync(p, 'utf8').matchAll(/from '((?:\.\.\/)+worker\/[^']+)'/g)) { const r = relative(root, resolve(dirname(p), m[1])); if (r.startsWith('worker/')) found.add(r); } } };
    walk(join(root, 'api')); walk(join(root, 'scripts'));
    expect(found.size).toBeGreaterThan(0);
    for (const f of found) { expect(SHARED_WITH_TOWER).toContain(f); expect(touchesRuntime([f])).toBe(true); }
    expect(touchesRuntime(['worker/mail/letter.js'])).toBe(false);
  });
});

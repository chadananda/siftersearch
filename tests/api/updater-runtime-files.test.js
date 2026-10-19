// A push touching only what no pm2 process loads is pulled without a reload (10-19: a script-only push killed Anís answers).
import { describe, it, expect } from 'vitest';
import { touchesRuntime } from '../../scripts/lib/runtime-files.js';

describe('updater: runtime files', () => {
  it('tests, docs, frontend, markdown and hand-run scripts need no reload', () => {
    expect(touchesRuntime(['scripts/anis/research-battery.mjs', 'tests/api/x.test.js', 'src/pages/a.astro', 'worker/mail/letter.js', 'api/lib/CLAUDE.md', 'planning/x.md'])).toBe(false);
  });
  it('API code, config, package.json, env and pm2-run scripts do', () => {
    for (const f of ['api/lib/assistant/respond.js', 'package.json', '.env-public', 'ecosystem.config.cjs', 'scripts/audit/audit-exchanges.mjs', 'scripts/update-server.js', 'config/sites.example.yaml'])
      expect(touchesRuntime(['docs/a.md', f])).toBe(true);
    expect(touchesRuntime([])).toBe(true);
  });
});

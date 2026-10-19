// The coordinator touches a service only if a change reaches its code (docs/architecture/continuous-deploy.md).
import { describe, it, expect } from 'vitest';
import { affectedApps } from '../../scripts/lib/import-graph.mjs';

describe('affected services', () => {
  const graphs = { api: new Set(['api/index.js', 'api/lib/assistant/researcher.js', 'api/lib/x.js']), reports: new Set(['api/workers/reports-worker.js', 'api/lib/ops/dewey-intake-job.js', 'api/lib/x.js']), audit: new Set(['scripts/audit/audit-exchanges.mjs']) };
  const apps = Object.keys(graphs).map((name) => ({ name, script: name }));
  const run = (changed) => Object.keys(affectedApps(changed, apps, { root: '/', graphOf: (s) => graphs[s] })).sort();
  it('only the services whose code changed', () => {
    expect(run(['api/lib/assistant/researcher.js'])).toEqual(['api']);
    expect(run(['api/lib/ops/dewey-intake-job.js'])).toEqual(['reports']);
    expect(run(['api/lib/x.js'])).toEqual(['api', 'reports']);
    expect(run(['tests/a.test.js', 'docs/x.md'])).toEqual([]);
  });
  it('global config touches every service; an api file no graph reaches touches every api-based one', () => {
    expect(run(['package.json'])).toEqual(['api', 'audit', 'reports']);
    expect(run(['api/lib/computed-import-target.js'])).toEqual(['api', 'reports']);
  });
});

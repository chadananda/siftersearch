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

describe('the indexing service is independent (Chad 10-19)', () => {
  it("the indexer's own code holds no Dewey or Anís module, so their changes never drain it", async () => {
    const { importGraph } = await import('../../scripts/lib/import-graph.mjs');
    const g = importGraph('api/workers/indexer-worker.js', { root: process.cwd() });
    expect(g.has('api/lib/ops/phrase-index-job.js')).toBe(true);
    expect([...g].filter((f) => /dewey|assistant\//.test(f))).toEqual([]);
  });
});

describe('new files', () => {
  it('a file added in this deploy cannot be loaded by running code — no fallback reload', async () => {
    const { affectedApps } = await import('../../scripts/lib/import-graph.mjs');
    const graphs = { api: new Set(['api/index.js']), worker: new Set(['api/workers/unified-worker.js']) };
    const apps = Object.keys(graphs).map((name) => ({ name, script: name }));
    const run = (changed, added) => Object.keys(affectedApps(changed, apps, { root: '/', graphOf: (s) => graphs[s], added })).sort();
    expect(run(['api/workers/indexer-worker.js'], ['api/workers/indexer-worker.js'])).toEqual([]);
    expect(run(['api/lib/old-computed.js'], [])).toEqual(['api', 'worker']);
  });
});

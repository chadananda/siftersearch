// mediaRemasterQualityJob under a drain: stops between talks and writes nothing (11-02: its loop held siftersearch-media in 'draining').
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mediaRemasterQualityJob } from '../../api/lib/ops/media-jobs.js';

describe('remaster quality pass and the drain', () => {
  const root = mkdtempSync(join(tmpdir(), 'qdrain-'));
  const talks = [1, 2, 3].map((id) => { const dir = join(root, `t${id}`); mkdirSync(dir); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ title: `t${id}` })); return { id, slug: `t${id}`, dir }; });
  const deps = (draining) => ({ dir: join(root, 'run'), draining, repo: { remasterCandidates: async () => talks }, ops: { pendingRuns: async () => [] },
    quality: { qualityOf: () => ({ verdict: 'usable', reason: 'x', metrics: {} }), summarize: (rows) => ({ talks: rows.length }), deferredMarkdown: () => '' } });

  it('a drain stops it between talks and nothing is written', async () => {
    let n = 0;
    const r = await mediaRemasterQualityJob({ write: true }, deps(() => ++n > 2));
    expect(r).toEqual({ yielded: true, read: 2 });
    expect(existsSync(join(root, 'run', 'remaster-quality.json'))).toBe(false);
  });
  it('without a drain it reads every talk and writes the summary', async () => {
    const r = await mediaRemasterQualityJob({ write: true }, deps(() => false));
    expect(r.talks).toBe(3);
    expect(existsSync(join(root, 'run', 'remaster-quality.json'))).toBe(true);
  });
});

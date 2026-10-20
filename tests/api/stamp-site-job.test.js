// planning/site-databases-plan.md step 1: every scraped site's Qdrant points carry `site`, stamped by doc-id batches.
import { describe, it, expect } from 'vitest';
import { stampSiteJob } from '../../api/lib/ops/stamp-site-job.js';

describe('stamp-site', () => {
  it('pages each site by doc id and stamps its points in every collection', async () => {
    const pages = { 'bahai-library.com': [[1, 2], [3]], 'oceanoflights.org': [[9]] };
    const calls = [];
    const docs = async ({ sourceSite, afterId }) => {
      const p = pages[sourceSite] || [];
      const page = p.find((ids) => ids[0] > afterId) || [];
      return { docs: page.map((id) => ({ id })) };
    };
    const r = await stampSiteJob({ sites: ['bahai-library.com', 'oceanoflights.org'], collections: ['phrases'] },
      { docs, qd: async (path, body) => { calls.push({ path, body }); }, index: async () => {} });
    expect(r.sites).toEqual({ 'bahai-library.com': 3, 'oceanoflights.org': 1 });
    expect(calls.map((c) => [c.body.payload.site, c.body.filter.must[0].match.any])).toEqual([
      ['bahai-library.com', [1, 2]], ['bahai-library.com', [3]], ['oceanoflights.org', [9]]]);
  });
});

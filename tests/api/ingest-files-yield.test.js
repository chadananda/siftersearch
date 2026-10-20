// 10-19: a 10,797-file ingest-files run held the reports service in 'draining' for hours. It yields between files.
import { describe, it, expect, vi } from 'vitest';

describe('ingest-files yields to a drain', () => {
  it('ingests nothing more once the service drains and reports yielded', async () => {
    vi.resetModules();
    vi.doMock('../../api/lib/drain.js', () => ({ isDraining: () => true, nap: async () => {} }));
    const ingestDocument = vi.fn();
    vi.doMock('../../api/services/ingester.js', () => ({ ingestDocument }));
    const { ingestFilesJob } = await import('../../api/lib/ops/ctai-jobs.js');
    const r = await ingestFilesJob({ paths: ['a.md', 'b.md'] });
    expect(r.yielded).toBe(true);
    expect(ingestDocument).not.toHaveBeenCalled();
  });
});

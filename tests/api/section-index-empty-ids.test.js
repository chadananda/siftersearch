// An empty id list is nothing to do, not "every document" (10-23).
import { describe, it, expect, vi } from 'vitest';
const listDocs = vi.fn(async () => ({ docs: [] }));
vi.mock('../../api/lib/docs-repo.js', () => ({ listDocs: (...a) => listDocs(...a) }));
vi.mock('../../api/lib/repos/sections-repo.js', () => ({ headingRowsForDoc: vi.fn(), replaceSections: vi.fn(), docsWithoutStructure: vi.fn(async () => []) }));
vi.mock('../../api/lib/repos/coverage-repo.js', () => ({ saveStructureCoverage: vi.fn() }));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn() }));
import { sectionIndexJob } from '../../api/lib/ops/section-index-job.js';

describe('section-index', () => {
  it('ids: [] reads nothing', async () => {
    expect(await sectionIndexJob({ ids: [] })).toMatchObject({ docs: 0 });
    expect(listDocs).not.toHaveBeenCalled();
  });
});

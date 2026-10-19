// The re-ingest list of whole-book "paragraphs" (Chad 10-19): short id windows, documents with their file and worst paragraph.
import { describe, it, expect } from 'vitest';
import { unsegmentedDocsJob } from '../../api/lib/ops/unsegmented-docs-job.js';

describe('unsegmented-docs', () => {
  it('surveys in windows and lists each document once, worst first', async () => {
    const seen = [];
    const r = await unsegmentedDocsJob({ span: 100 }, {
      top: async () => 250,
      windows: async ({ afterId }) => { seen.push(afterId); return afterId === 100 ? [{ doc_id: 7, n: 1, max_chars: 90000 }, { doc_id: 9, n: 2, max_chars: 12000 }] : afterId === 200 ? [{ doc_id: 7, n: 1, max_chars: 300000 }] : []; },
      docs: async ({ ids }) => ({ docs: ids.map((id) => ({ id, title: `doc ${id}`, source_site: 'bahai-library.com', file_path: `pdf-${id}.md` })) }),
    });
    expect(seen).toEqual([0, 100, 200]);
    expect(r.documents).toBe(2);
    expect(r.list[0]).toMatchObject({ doc_id: 7, paragraphs: 2, max_chars: 300000, file_path: 'pdf-7.md' });
    expect(r.by_site).toEqual({ 'bahai-library.com': 2 });
  });

  it('lists LIVE documents only — a deleted duplicate with orphaned paragraphs is counted apart, never re-ingested', async () => {
    let scope;
    const r = await unsegmentedDocsJob({ span: 100 }, {
      top: async () => 50,
      windows: async () => [{ doc_id: 1, n: 1, max_chars: 8538 }, { doc_id: 2, n: 1, max_chars: 9000 }],
      docs: async (q) => { scope = q.scope; return { docs: q.ids.filter((id) => id === 2).map((id) => ({ id, file_path: `f${id}.md` })) }; },
    });
    expect(scope).toBe('live');
    expect(r.list.map((d) => d.doc_id)).toEqual([2]);
    expect(r.deleted_docs_with_live_text).toBe(1);
  });
});

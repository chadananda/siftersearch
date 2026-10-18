// The Observatory's import board: each book's stages, its OCR receipt, never a server path (public endpoint).
import { describe, it, expect } from 'vitest';
import { stagesOf, buildImportBoard } from '../../api/lib/import-board.js';

const st = (item, layers) => Object.fromEntries(stagesOf(item, layers).map((s) => [s.key, s.state]));

describe('stagesOf', () => {
  it('a text document imported and partly indexed', () => {
    const s = st({ state: 'ingested', identified: { appraisal: { title: 'T' } } }, { text: { generated: 10, total: 10 }, keyword: { indexed: 4, total: 10 } });
    expect(s).toMatchObject({ checked: 'done', appraised: 'done', imported: 'done', text: 'done', keyword: 'active', embedding: 'todo' });
    expect(s.ocr).toBeUndefined();   // no OCR stage for a text document
  });
  it('a scan at OCR, and one whose OCR failed the check', () => {
    expect(st({ state: 'needs-ocr', identified: {} })).toMatchObject({ ocr: 'active', imported: 'todo' });
    expect(st({ state: 'needs-human', identified: { slp_rejected: { check: { why: ['x'] } } } })).toMatchObject({ ocr: 'fail', imported: 'wait' });
  });
});

describe('buildImportBoard', () => {
  it('shapes public rows: receipt and progress, no server paths', async () => {
    const board = async () => ({ imported_24h: 3, imported_7d: 9, byState: { source: 1, processing: 1, 'needs-ocr': 2, 'needs-human': 1, ingested: 40 },
      items: [
        { id: 1, title: 'Notes', state: 'ingested', doc_id: 77, updated_at: '2026-10-18T10:00:00Z', original_path: '/tank/dropbox/x/Notes.pdf',
          identified: { shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' }, slp: { pages: 3, score: 95, receipt: { narrative: 'read with 4 engines' }, check: { words: 900, perPage: 300, sampleFound: 0.8 } } },
          log: [{ why: 'ingested as document 77 — kept at /tank/library-originals/ocr/abc.slp.md' }] },
        { id: 2, title: 'Scan', state: 'needs-ocr', updated_at: '2026-10-18T10:05:00Z', identified: { slp_progress: { step: 'processing', pages_done: 4, pages_total: 20 } }, log: [] },
      ] });
    const b = await buildImportBoard({ board, coverage: async () => ({ 77: { text: { generated: 5, total: 5 } } }) });
    expect(b.counts).toMatchObject({ imported_24h: 3, in_progress: 2, ocr: 2, waiting: 1 });
    expect(b.items[0]).toMatchObject({ shelf: "Baha'i › Pilgrim Notes", ocr: { done: true, receipt: { narrative: 'read with 4 engines' } } });
    expect(b.items[1].ocr).toMatchObject({ done: false, pages_done: 4, pages_total: 20 });
    expect(JSON.stringify(b)).not.toMatch(/\/tank\//);
  });
});

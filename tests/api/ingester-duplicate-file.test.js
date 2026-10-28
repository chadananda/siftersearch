// A second file with the same bytes must not flip the doc's path (10-28 writer-bytes root cause), and a same-shelf rename must not dirty paragraphs.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = mkdtempSync(join(tmpdir(), 'lib-'));
vi.mock('../../api/lib/config.js', async (orig) => { const m = await orig(); m.default.library = { ...(m.default.library || {}), basePath: base }; return m; });
const q = vi.hoisted(() => ({ queryOne: vi.fn(), queryAll: vi.fn(async () => []), query: vi.fn(async () => ({ changes: 1 })), transaction: vi.fn() }));
vi.mock('../../api/lib/db.js', () => q);
const dirty = vi.hoisted(() => vi.fn(async () => ({ changes: 200 })));
vi.mock('../../api/lib/content.js', () => ({ content: { markDocDirty: dirty, restoreByDoc: vi.fn() } }));

const { ingestDocument, isStillOnDisk } = await import('../../api/services/ingester.js');
const TEXT = '---\ntitle: T\n---\n\nPara one.\n\nPara two.\n';

describe('duplicate file vs real move', () => {
  beforeEach(() => { dirty.mockClear(); q.query.mockClear(); q.queryOne.mockReset(); });
  it('same hash, original still on disk: skipped, nothing written', async () => {
    mkdirSync(join(base, 'Baha\'i/Compilations'), { recursive: true });
    writeFileSync(join(base, "Baha'i/Compilations/a.md"), TEXT);
    q.queryOne.mockImplementation(async (sql) => (/file_hash = \?/.test(sql) ? { id: 7, file_path: "Baha'i/Compilations/a.md", religion: "Baha'i", collection: 'Compilations' } : null));
    const r = await ingestDocument(TEXT, {}, "Baha'i/Compilations/a-dewey661.md");
    expect(r).toMatchObject({ documentId: 7, skipped: true, duplicateOf: "Baha'i/Compilations/a.md" });
    expect(dirty).not.toHaveBeenCalled(); expect(q.query).not.toHaveBeenCalled();
    expect(isStillOnDisk("Baha'i/Compilations/a.md")).toBe(true);
  });
  it('original gone, same shelf: path moves, paragraphs NOT dirtied', async () => {
    q.queryOne.mockImplementation(async (sql) => (/file_hash = \?/.test(sql) ? { id: 7, file_hash: null, file_path: "Baha'i/Compilations/gone.md", religion: "Baha'i", collection: 'Compilations' } : /FROM content/.test(sql) ? { x: 1 } : null));
    // hash must equal for the 'unchanged' branch: reuse the hash the ingester computes
    const { hashContent } = await import('../../api/services/ingester.js');
    q.queryOne.mockImplementation(async (sql) => (/file_hash = \?/.test(sql) ? { id: 7, file_hash: hashContent(TEXT.trim()), file_path: "Baha'i/Compilations/gone.md", religion: "Baha'i", collection: 'Compilations' } : /FROM content/.test(sql) ? { x: 1 } : null));
    const r = await ingestDocument(TEXT, {}, "Baha'i/Compilations/new.md");
    expect(r.status).toBe('moved');
    expect(dirty).not.toHaveBeenCalled();
  });
});

describe('reused paragraph no-op detection', () => {
  it('isSameReuse is null-safe and detects a real change', async () => {
    const { isSameReuse } = await import('../../api/services/ingester.js');
    const row = { heading: null, blocktype: 'paragraph', pdf_page: null, block_attrs: null };
    expect(isSameReuse(row, { heading: '', blocktype: 'paragraph', pdfPage: null, blockAttrsJson: null })).toBe(true);
    expect(isSameReuse(row, { heading: 'H', blocktype: 'paragraph', pdfPage: null, blockAttrsJson: null })).toBe(false);
    expect(isSameReuse(row, { heading: null, blocktype: 'paragraph', pdfPage: 3, blockAttrsJson: null })).toBe(false);
  });
});

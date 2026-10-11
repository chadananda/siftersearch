// File-level Arabic segmentation (Chad 10-11): Haiku 5.5 marks sentences ONCE in the source file; the edition's
// paragraphs and every other byte stay; a paragraph the model rewrote is left unmarked; spend is capped.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../api/services/segmenter.js', () => ({
  batchAddSentenceMarkers: vi.fn(async (paras) => paras.map((p) => p.id === '1'
    ? { id: p.id, text: '⁅s1⁆تغيير⁅/s1⁆', sentenceCount: 1 }                              // a "rewrite" → refused
    : { id: p.id, text: `⁅s1⁆${p.text}⁅/s1⁆`, sentenceCount: 1 })),
}));
const { segmentFile, isPunctuated, markFrontmatter, splitBody } = await import('../../api/lib/segment/file-segment.js');
const { isFileSegmentAllowed } = await import('../../api/lib/anthropic-policy.js');

describe('file-segment', () => {
  it('splitBody keeps every separator, so join() is byte-identical', () => {
    const b = 'أ ب\n\nج د\n \nهـ و\n';
    expect(splitBody(b).join('')).toBe(b);
  });
  it('isPunctuated = the segmenter rule (≥1 of . ! ? ؟ ؛ per 50 words)', () => {
    expect(isPunctuated(['قال كذا. ثم قال كذا؟'])).toBe(true);
    expect(isPunctuated([Array(120).fill('كلمة').join(' ')])).toBe(false);
  });
  it('markFrontmatter sets needs_segmentation: false once and keeps other keys', () => {
    const t = markFrontmatter('---\ntitle: X\nneeds_segmentation: true\n---\nbody', 'claude-haiku-5-5 2026-10-11');
    expect(t).toBe("---\nneeds_segmentation: false\ntitle: X\nsegmented_by: 'claude-haiku-5-5 2026-10-11'\n---\nbody");
  });
  it('marks sentences in place, refuses a rewritten paragraph, backs up the original', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seg-'));
    const f = join(dir, 'book.md');
    const body = `# باب\n\n${Array(60).fill('حدثنا').join(' ')}\n\n${Array(60).fill('اخبرنا').join(' ')}\n`;
    writeFileSync(f, `---\ntitle: T\n---\n${body}`);
    const r = await segmentFile(f, { apply: true, maxUsd: 1, backupDir: join(dir, 'bk'), relPath: 'book.md' });
    expect(r).toMatchObject({ status: 'segmented', paragraphs: 2, integrityFailures: 1 });
    const out = readFileSync(f, 'utf8');
    expect(out).toContain('needs_segmentation: false');
    expect(out).toContain(`⁅s1⁆${Array(60).fill('حدثنا').join(' ')}⁅/s1⁆`);
    expect(out).toContain(`\n${Array(60).fill('اخبرنا').join(' ')}\n`);                   // rewritten one left as it was
    expect(out).toContain('# باب');
    expect(readFileSync(r.backup, 'utf8')).toContain('title: T');
  });
  it('refuses a file over the spend cap (dry estimate first)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seg-'));
    const f = join(dir, 'big.md');
    writeFileSync(f, `---\ntitle: B\n---\n${Array(200000).fill('كلمة').join(' ')}\n`);
    expect((await segmentFile(f, { apply: true, maxUsd: 0.01 })).status).toBe('over-budget');
  });
  it('policy: Anthropic allowed for segmentation only with Haiku 5.5 (any language)', () => {
    expect(isFileSegmentAllowed({ stage: 'file-segment', model: 'claude-haiku-5-5', sourceLang: 'ar' })).toBe(true);
    expect(isFileSegmentAllowed({ stage: 'file-segment', model: 'claude-haiku-5-5', sourceLang: 'he' })).toBe(true);
    expect(isFileSegmentAllowed({ stage: 'file-segment', model: 'claude-sonnet-5-5', sourceLang: 'ar' })).toBe(false);
    expect(isFileSegmentAllowed({ stage: 'grounding', model: 'claude-haiku-5-5', sourceLang: 'ar' })).toBe(false);
  });
});

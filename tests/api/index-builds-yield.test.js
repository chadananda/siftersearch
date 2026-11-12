// The title index and the book finder's index build in chunks that yield the event loop — a single synchronous build
// (≈2–5 s on tower) froze anis after every reload and Jev's calls timed out (11-12). Same result as the pure build.
import { describe, it, expect } from 'vitest';
import { buildIndex, buildIndexYielding } from '../../api/lib/dewey/title-index.js';
import { buildBookIndex, buildBookIndexYielding } from '../../api/lib/assistant/book-finder.js';

const rows = Array.from({ length: 12000 }, (_, i) => ({ id: i + 1, title: `Book number ${i} of the Kitáb-i-Íqán series`, author: `Author ${i % 50}` }));
const sections = Array.from({ length: 6000 }, (_, i) => ({ section_id: i + 1, doc_id: (i % 100) + 1, title: `Chapter ${i}: the Dispensation`, book: 'The World Order' }));
const aliases = [{ title: 'Kitáb-i-Íqán', names: ['Iqan', 'Book of Certitude'] }, { section: 'Dispensation', names: ['the Dispensation of Bahá’u’lláh'] }];

describe('index builds yield the event loop', () => {
  it('title index: same docs and grams, and timers run during the build', async () => {
    let ticks = 0; const iv = setInterval(() => ticks++, 0);
    const y = await buildIndexYielding(rows);
    clearInterval(iv);
    const s = buildIndex(rows);
    expect(y.size).toBe(s.size);
    expect([...y.byGram.keys()].sort()).toEqual([...s.byGram.keys()].sort());
    expect(ticks).toBeGreaterThan(0);
  });
  it('book index: same entries, other names and postings', async () => {
    let ticks = 0; const iv = setInterval(() => ticks++, 0);
    const y = await buildBookIndexYielding({ docs: rows, sections, aliases });
    clearInterval(iv);
    const s = buildBookIndex({ docs: rows, sections, aliases });
    expect(y.size).toBe(s.size);
    expect(y.entries.filter((e) => e.alias).length).toBe(rows.length + sections.length);
    expect([...y.post.get('iqan')]).toEqual([...s.post.get('iqan')]);
    expect(ticks).toBeGreaterThan(0);
  });
});

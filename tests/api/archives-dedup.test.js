// Cross-collection dedup cascade (archives/dedup.js) + the worker fingerprint (scripts/media/worker/fingerprint.py, run for real when python3 is there).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clusterDuplicates, itemRow, registryRow, JACCARD, MIN_WORDS } from '../../api/lib/archives/dedup.js';

const PY = spawnSync('python3', ['--version']).status === 0;
const fp = (path) => JSON.parse(spawnSync('python3', [join(process.cwd(), 'scripts/media/worker/fingerprint.py'), path], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout);
// a deterministic pseudo-English book: sentences drawn from a vocabulary by a seeded generator
const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const vocab = Array.from({ length: 900 }, (_, i) => `w${(i * 7919).toString(36)}x`);
const book = (seed, paragraphs = 70) => { const r = rng(seed); return Array.from({ length: paragraphs }, () => Array.from({ length: 60 }, () => vocab[Math.floor(r() * vocab.length)]).join(' ') + '.'); };
// the same work typed again: ~5% of the words differ, other front matter and back matter, other layout
const retype = (paras, seed) => { const r = rng(seed); return paras.map((p) => p.split(' ').map((w) => (r() < 0.05 ? vocab[Math.floor(r() * vocab.length)] : w)).join(' ')); };
const front = (t) => `${t}\n\nA Second Edition\n\nContents\n\nChapter One\nChapter Two\nChapter Three\n\nPreface\n\n`;
const back = '\n\nAppendix\n\n' + Array.from({ length: 6 }, (_, i) => `appendix note ${i} with a few words of commentary on the text above`).join('\n\n') + '\n\nIndex\n\nadam 1 5\nbeauty 2 9\n';
const write = (name, body) => { const p = join(mkdtempSync(join(tmpdir(), 'fp-')), name); writeFileSync(p, body); return p; };
const rowOf = (drive, rel, f, o = {}) => ({ key: `${drive}:${rel}`, id: o.id ?? 1, drive, rel, title: o.title ?? null, bytes: o.bytes ?? null, cls: o.cls ?? 'born_digital', pages: o.pages ?? null, sha: f.sha256, words: f.words, norm_sha: f.norm_sha, minhash: f.minhash });

describe.skipIf(!PY)('the same work typed twice clusters as one (fingerprint.py + the cascade)', () => {
  const orig = book(1), other = book(2);
  const A = fp(write('a.txt', front('The Great Book') + orig.join('\n\n') + back));
  const B = fp(write('b.txt', `---\ntitle: Great Book\n---\n\nGREAT BOOK, THE\nTyped by Someone Else\n\n` + retype(orig, 9).join('\n\n') + '\n\nBibliography\n\nA list of works cited in this volume\n'));
  const C = fp(write('c.txt', front('A Different Work') + other.join('\n\n') + back));
  const D = fp(write('d.txt', front('The Great Book') + orig.join('\n\n') + back));
  it('the same file in another folder is the same hash; the same text with other front/back matter shares the normalised body', () => {
    expect(fp(write('a2.txt', front('The Great Book') + orig.join('\n\n') + back)).sha256).toBe(A.sha256);
    expect(D.norm_sha).toBe(A.norm_sha);
    expect(A.norm_sha).not.toBe(C.norm_sha);
  });
  it('~5% word differences + different front/back matter: one cluster, caught by the fingerprint (no title given, so not by title); a different work stays apart', () => {
    const r = clusterDuplicates([rowOf('golden-age', 'x/a.txt', A, { id: 1 }), rowOf('troxel', 'y/b.txt', B, { id: 2 }), rowOf('golden-age', 'z/c.txt', C, { id: 3 })]);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].members).toHaveLength(1);
    expect(r.clusters[0].members[0]).toMatchObject({ step: 'fingerprint' });
    expect(r.clusters[0].members[0].score).toBeGreaterThanOrEqual(JACCARD);
    expect(r.dups.has('golden-age:z/c.txt')).toBe(false);
  });
  it('the 5% typing scores a high Jaccard, unrelated books a low one (the margin the threshold sits in)', () => {
    const j = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a.minhash.slice(i * 16, i * 16 + 16) === b.minhash.slice(i * 16, i * 16 + 16)) n++; return n / 64; };
    expect(j(A, B)).toBeGreaterThan(0.5);
    expect(j(A, C)).toBeLessThan(0.1);
  });
});

describe('cascade (hash, normalised body, title+length, library, best copy)', () => {
  const r = (drive, rel, o = {}) => ({ key: `${drive}:${rel}`, id: o.id, drive, rel, title: o.title ?? null, bytes: o.bytes ?? null, cls: o.cls ?? 'born_digital', pages: o.pages ?? null, sha: o.sha ?? null, words: o.words ?? null, norm_sha: o.norm ?? null, minhash: null });
  it('the same bytes on two drives, whatever their names; the same normalised body in another format', () => {
    const x = clusterDuplicates([r('a', 'p/one.pdf', { id: 1, sha: 'S', words: 9000 }), r('b', 'q/zzz.pdf', { id: 2, sha: 'S', words: 9000 }), r('b', 'q/doc.docx', { id: 3, norm: 'N', words: 9000, cls: 'text_doc' }), r('a', 'p/two.epub', { id: 4, norm: 'N', words: 9000, cls: 'text_doc' })]);
    expect([...x.dups.values()].map((d) => d.step).sort()).toEqual(['hash', 'normalised-body']);
    expect(x.by_step).toMatchObject({ hash: 1, 'normalised-body': 1 });
  });
  it('title + length: fuzzy main title ("The Hidden Words" = "Hidden Words, The (1)") and a similar length; a different length is another book', () => {
    const x = clusterDuplicates([r('a', 'f/1.pdf', { id: 1, title: 'The Hidden Words', pages: 100 }), r('b', 'g/2.pdf', { id: 2, title: 'Hidden Words', pages: 104 }), r('b', 'g/3.pdf', { id: 3, title: 'The Hidden Words', pages: 20 })]);
    expect(x.clusters).toHaveLength(1);
    expect(x.clusters[0].members[0]).toMatchObject({ step: 'title+length', id: expect.any(Number) });
    expect(x.dups.has('b:g/3.pdf')).toBe(false);
  });
  it('another volume of a series is not a copy: "Witnesses 1" ≠ "Witnesses_3"; an unnumbered copy or a year still matches', () => {
    const x = clusterDuplicates([r('a', 'w/Witnesses 1 Genesis.pdf', { id: 1, title: 'Witnesses 1: Genesis', pages: 200 }), r('a', 'w/Witnesses_3_Genesis.pdf', { id: 2, title: 'Witnesses 3: Genesis', pages: 200 }),
      r('b', 'x/Tribute (1958).pdf', { id: 3, title: 'A Tribute to Shoghi Effendi', pages: 90 }), r('b', 'x/tribute.pdf', { id: 4, title: 'A Tribute to Shoghi Effendi', pages: 91 })]);
    expect(x.dups.has('a:w/Witnesses 1 Genesis.pdf') || x.dups.has('a:w/Witnesses_3_Genesis.pdf')).toBe(false);
    expect(x.clusters).toHaveLength(1);
  });
  it('the best copy is kept: complete over partial, text layer over scan, then larger — and listed members name it', () => {
    const x = clusterDuplicates([r('a', 's.pdf', { id: 1, title: 'Gleanings Whole', pages: 300, cls: 'scan' }), r('a', 't.pdf', { id: 2, title: 'Gleanings Whole', pages: 296, cls: 'born_digital' }), r('b', 'u.pdf', { id: 3, title: 'Gleanings Whole', pages: 290, cls: 'image_pdf' })]);
    expect(x.clusters[0].keep).toMatchObject({ id: 2 });
    expect(x.dups.get('a:s.pdf')).toMatchObject({ of_id: 2, of_drive: 'a' });
    const y = clusterDuplicates([r('a', 's.pdf', { id: 1, title: 'Gleanings Whole', pages: 300, cls: 'scan' }), r('a', 't.pdf', { id: 2, title: 'Gleanings Whole', pages: 280, cls: 'born_digital' })]);
    expect(y.clusters[0].keep).toMatchObject({ id: 1 });   // 280 of 300 pages is partial: the complete scan wins over the text layer
  });
  it('a file the library already holds (Dewey sha256) is a duplicate of the library copy', () => {
    const x = clusterDuplicates([r('a', 'p.pdf', { id: 1, sha: 'LIB' }), r('a', 'q.pdf', { id: 2, sha: 'NEW' })], { libShas: new Set(['LIB']) });
    expect(x.dups.get('a:p.pdf')).toMatchObject({ step: 'library-hash', of: null });
    expect(x.dups.has('a:q.pdf')).toBe(false);
  });
  it('rows from the registry and from a drive item share one shape', () => {
    expect(registryRow({ drive_id: 'd', path: 'p.pdf', item_id: 3, sha256: 's', title: 'T', words: 5, minhash: 'm' })).toMatchObject({ key: 'd:p.pdf', id: 3, sha: 's', words: 5 });
    expect(itemRow('d', { id: 4, primary_rel: 'q.pdf', title: 'T', metadata: { probe: { class: 'scan', pages: 9, fp: { sha256: 'x', words: 0 } } } })).toMatchObject({ key: 'd:q.pdf', cls: 'scan', pages: 9, sha: 'x' });
  });
});

describe('fuzzy steps never chain (11-03: one golden-age cluster held 3,461 unrelated files)', () => {
  const chunk = (c, i) => `${c}${String(i).padStart(15, '0')}`;
  const mh = (f) => Array.from({ length: 64 }, (_, i) => f(i)).join('');
  const r = (rel, minhash, words, o = {}) => ({ key: `g:${rel}`, id: o.id, drive: 'g', rel, title: null, bytes: null, cls: 'born_digital', pages: null, sha: o.sha ?? null, words, norm_sha: null, minhash });
  const A = mh((i) => chunk('a', i)), B = mh((i) => (i < 32 ? chunk('a', i) : chunk('b', i))), C = mh((i) => (i < 32 ? chunk('c', i) : chunk('b', i)));
  it('A~B and B~C (Jaccard 0.5 each) but A and C share nothing: C is not a duplicate of A', () => {
    const x = clusterDuplicates([r('a.txt', A, 9000, { id: 1 }), r('b.txt', B, 8000, { id: 2 }), r('c.txt', C, 7000, { id: 3 })]);
    expect(x.clusters).toHaveLength(1);
    expect(x.clusters[0].keep).toMatchObject({ id: 1 });
    expect(x.clusters[0].members.map((m) => m.id)).toEqual([2]);
    expect(x.dups.has('g:c.txt')).toBe(false);
  });
  it('an exact copy of a satellite rides with it, reported by the fuzzy edge that joined it', () => {
    const x = clusterDuplicates([r('a.txt', A, 9000, { id: 1 }), r('b.txt', B, 8000, { id: 2, sha: 'S' }), r('b2.txt', B, 8000, { id: 4, sha: 'S' })]);
    expect(x.dups.get('g:b2.txt')).toMatchObject({ of_id: 1, step: 'fingerprint', score: 0.5 });
  });
  it(`a fingerprint needs ${MIN_WORDS} words on both sides`, () => {
    expect(clusterDuplicates([r('a.txt', A, 9000, { id: 1 }), r('b.txt', B, MIN_WORDS - 1, { id: 2 })]).clusters).toHaveLength(0);
  });
});

/**
 * THE CANONICAL CHEAT SHEET IS VERBATIM.
 *
 * It was pasted correctly into OpenAPI `info.description` and then REWRITTEN on /docs/api: a heading
 * ("Answering who was at X — read this first") was put in front of it, and the proof line was reworded —
 * "once live" dropped, the URL turned into a dash. A block that must be quoted exactly is not a block to
 * improve, and these assertions are what stop the next well-meaning edit.
 *
 * Backticks may become <code> and the lines may sit in <ol>/<p> — the WORDS and their ORDER may not change,
 * and nothing may precede them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LINES = [
  '1. Look up the event — `GET /entities/lookup?q=` then `GET /entities/{id}` for `participants[]`.',
  '2. Look up the group — same on the group node.',
  '3. List the edges — intersection of the two rosters with `participated-in`. `visited` is not attended. `people[]` is the answer; `ids` is only a projection.',
  'Passage search (`POST /search`) quotes what you found. It cannot build the list.',
  'Proof: Letters of the Living ∩ Badasht — /who-was-at/badasht (live).',
];
// Backticks are markup once rendered; everything else must survive unchanged.
const plain = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ').trim();
const EXPECTED = LINES.map(plain);

describe('OpenAPI info.description', () => {
  const server = readFileSync(join(ROOT, 'api/server.js'), 'utf8');

  it('STARTS with line 1 — nothing in front of the numbered lines', () => {
    const d = server.slice(server.indexOf('description: ['));
    const firstEntry = d.slice(d.indexOf("'"), d.indexOf("',") + 1);
    expect(firstEntry).toContain('1. Look up the event');
  });

  it('carries all five lines verbatim, in order, with nothing in front', () => {
    // The literal lines as they appear in the source array, in order.
    const idx = LINES.map((l) => server.indexOf(l));
    for (let i = 0; i < LINES.length; i++) expect(idx[i], `line ${i + 1} missing verbatim`).toBeGreaterThan(-1);
    for (let i = 1; i < LINES.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  // "once live" was correct only while the page did not exist. It exists, so the phrase is now wrong on
  // both surfaces and must not survive anywhere in the spec.
  it('does NOT say "once live" anywhere', () => {
    expect(server).not.toMatch(/once live/);
  });

  it('names the proof page in its live form', () => {
    expect(server).toContain('Proof: Letters of the Living ∩ Badasht — /who-was-at/badasht (live).');
  });
});

describe('/docs/api', () => {
  const src = readFileSync(join(ROOT, 'src/pages/docs/api.astro'), 'utf8');
  // Visible body text: everything inside <DocsLayout>, tags stripped, entities decoded.
  const body = plain(
    src.slice(src.indexOf('>', src.indexOf('<DocsLayout')) + 1, src.lastIndexOf('</DocsLayout>'))
      .replace(/<!--[\s\S]*?-->/g, '')
      // Block tags separate words; INLINE tags must close up, or `<code>participants[]</code>.` renders as
      // "participants[] ." and the comparison fails on the page's punctuation rather than its words.
      .replace(/<\/(p|div|li|ol|ul|h[1-6]|section|aside)>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&mdash;/g, '—').replace(/&cap;/g, '∩')
      .replace(/&#123;/g, '{').replace(/&#125;/g, '}')
      .replace(/&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, '&'));

  it('BODY STARTS with the cheat sheet — no heading, no title in front of it', () => {
    expect(body.startsWith(EXPECTED[0])).toBe(true);
  });

  it('has no "read this first" style heading wrapping it', () => {
    expect(src).not.toMatch(/Answering.{0,40}read this first/i);
  });

  it('carries all five lines, in order, unaltered', () => {
    let cursor = 0;
    for (const line of EXPECTED) {
      const at = body.indexOf(line, cursor);
      expect(at, `not found in order: ${line.slice(0, 60)}…`).toBeGreaterThan(-1);
      cursor = at + line.length;
    }
  });

  it('keeps the proof sentence exactly, and does not say "once live"', () => {
    expect(body).toContain('Proof: Letters of the Living ∩ Badasht — /who-was-at/badasht (live).');
    expect(src).not.toMatch(/once live/);
  });
});

describe('/docs/entity-search points crawlers at the app', () => {
  const src = readFileSync(join(ROOT, 'src/pages/docs/entity-search.astro'), 'utf8');
  // Card-level, not page-level. The link was first glued to the "Declaration of the Báb" card — the WRONG
  // event — and a page-wide "the href exists somewhere" assertion passed happily, which is how it shipped.
  const cards = src.split('<div class="example-card">').slice(1);
  // Match on the card's own QUESTION, not any substring: there are TEN example cards and two mention the
  // Declaration and two mention a Letter of the Living, so `find(c => c.includes('Declaration of the Báb'))`
  // returned the wrong card and the assertion passed while the link sat on the wrong event.
  const cardAsking = (q) => cards.find((c) => c.includes(q));
  const DECLARATION = 'Who was present at the Declaration of the Báb on May 23, 1844?';
  const LETTERS = 'List every Letter of the Living and what is known about each';

  it('the Letters of the Living card carries the link', () => {
    const card = cardAsking(LETTERS);
    expect(card, 'no Letters of the Living example card found').toBeDefined();
    expect(card).toMatch(/href="\/who-was-at\/badasht"/);
  });

  it('the Declaration of the Báb card does NOT — different event', () => {
    const card = cardAsking(DECLARATION);
    expect(card, 'no Declaration example card found').toBeDefined();
    expect(card).not.toMatch(/who-was-at\/badasht/);
  });

  it('the Declaration question itself is left alone', () => {
    expect(src).toContain('Who was present at the Declaration of the Báb on May 23, 1844?');
  });

  it('the link appears exactly once — one href is enough', () => {
    expect((src.match(/href="\/who-was-at\/badasht"/g) || []).length).toBe(1);
  });
});

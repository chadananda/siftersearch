// Reader links use the doc's STORED slug (Chad 10-22): a compilation paragraph's effective author (Shoghi Effendi in Lights
// of Guidance, doc 8680) built "shoghi-effendi_lights-of-guidance…" → "Document not found". Stale links resolve by title part.
import { describe, it, expect, vi } from 'vitest';

const ROW = { id: 501, doc_id: 8680, paragraph_index: 6229, text: 'The Guardian wrote…', heading: null, blocktype: 'paragraph',
  authors: JSON.stringify([{ name: 'Shoghi Effendi', role: 'author', basis: 'reference' }]),
  d_title: 'Lights of Guidance: A Bahá’í Reference File', d_author: 'Helen Hornby (compiler)', d_religion: "Bahá'í",
  d_collection: 'Compilations', d_language: 'en', d_year: '1983', d_filename: 'lights.md', d_slug: 'helen-hornby_lights-of-guidance-a-bahai-reference-file',
  d_source_site: null, d_source_url: null };
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn(), queryAll: vi.fn(async () => [ROW]) }));

const { paragraphsByIds, paragraphDoc } = await import('../../api/lib/paragraphs-repo.js');
const { linkFor, readerUrl } = await import('../../api/lib/source-links.js');
const { resolveByTitlePart, slugTitlePart } = await import('../../api/lib/slug.js');
const GOOD = 'https://siftersearch.com/library/bahai/compilations/helen-hornby_lights-of-guidance-a-bahai-reference-file#p6229';

describe('reader links use docs.slug, never the paragraph author', () => {
  it('a hydrated hit carries the doc slug while its author is the paragraph writer', async () => {
    const [h] = await paragraphsByIds([501]);
    expect(h.author).toBe('Shoghi Effendi');
    expect(h.slug).toBe('helen-hornby_lights-of-guidance-a-bahai-reference-file');
    expect(linkFor(h, h.paragraph_index).url).toBe(GOOD);
    expect(readerUrl(h, 6229)).toBe(GOOD);
  });
  it('a hit with no stored slug falls back to the id viewer, not an author-derived path', () => {
    const h = paragraphDoc({ id: 1, doc_id: 8680, paragraph_index: 3, authors: ROW.authors },
      { title: ROW.d_title, author: ROW.d_author, religion: "Bahá'í", collection: 'Compilations' }, 5);
    expect(h.author).toBe('Shoghi Effendi');
    const url = readerUrl(h, 3);
    expect(url).not.toMatch(/shoghi-effendi/);
    expect(url).toBe('https://siftersearch.com/library/view?doc=8680#p3');
  });
});

describe('resolveByTitlePart (stale author prefix)', () => {
  const lights = { id: 8680, slug: 'helen-hornby_lights-of-guidance-a-bahai-reference-file', title: 'Lights of Guidance: A Bahá’í Reference File', author: 'Helen Hornby (compiler)', collection: 'Compilations' };
  const other = { id: 9, slug: 'x_the-promised-day-is-come', title: 'The Promised Day Is Come', author: 'X' };
  it('maps the wrong-author slug to the one book with that title', () => {
    expect(slugTitlePart('shoghi-effendi_lights-of-guidance-a-bahai-reference-file')).toBe('lights-of-guidance-a-bahai-reference-file');
    expect(resolveByTitlePart('shoghi-effendi_lights-of-guidance-a-bahai-reference-file', [other, lights])?.id).toBe(8680);
  });
  it('ignores deleted and duplicate copies; ambiguous titles resolve to nothing', () => {
    const dup = { ...lights, id: 1, slug: 'helen-hornby_lights-of-guidance-a-bahai-reference-file-2', duplicate_of: 8680 };
    expect(resolveByTitlePart('shoghi-effendi_lights-of-guidance-a-bahai-reference-file', [lights, dup])?.id).toBe(8680);
    const twin = { ...lights, id: 2, slug: 'someone_lights-of-guidance-a-bahai-reference-file' };
    expect(resolveByTitlePart('shoghi-effendi_lights-of-guidance-a-bahai-reference-file', [lights, twin])).toBeNull();
    expect(resolveByTitlePart('lights-of-guidance-a-bahai-reference-file', [lights])).toBeNull();   // no prefix → not this path
  });
});

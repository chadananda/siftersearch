// slug-metadata report: locator title/author → what the book prints; byline first, title page via the role, surname must corroborate.
import { describe, it, expect } from 'vitest';
import { slugMetadataJob, slugSurname, slugAuthor, unshout, fileTitle, figureName, sharesFileWord, issueOf } from '../../api/lib/ops/slug-metadata-job.js';
import { authorFromText } from '../../api/lib/text/source-metadata.js';

const reply = (j) => async () => ({ choices: [{ message: { content: JSON.stringify(j) } }] });
const run = (rows, texts, create) => slugMetadataJob({}, { gaps: async () => rows, paragraphs: async (id) => [{ text: texts[id] }], create });

describe('slug-metadata', () => {
  it('slug surnames: locators and bare surnames carry one; generic slugs do not', () => {
    expect(slugSurname('pdf-h-holley')).toBe('holley');
    expect(slugSurname('pdf-a-armstrong-ingram')).toBe('armstrong');
    expect(slugSurname('bayat')).toBe('bayat');
    expect(slugSurname('newspaper')).toBe(null);
    expect(slugSurname('pdf-journal-de-constantinople-ocr-ed')).toBe(null);
    expect(slugAuthor('pdf-h-holley') && slugAuthor('bayat') && !slugAuthor('Horace Holley')).toBe(true);
  });
  it('a BY line with the name on the next line is a byline', () => {
    expect(authorFromText('THE MODERN SOCIAL RELIGION\nBY\nHORACE HOLLEY\nLONDON', { expectSurname: 'holley' })).toBe('HORACE HOLLEY');
  });
  it('byline found → no LLM call; title page via the role otherwise; a non-corroborating author goes to review', async () => {
    let calls = 0;   // 1: byline author, title from the page read (the byline rule's title is a first-line guess)
    const create = async (role, b) => { calls++; return reply(/Jane Smith/.test(b.messages[0].content) ? { title: 'WORLD ORDER ESSAYS', author: 'Jane Smith', kind: 'book', printed: true }
      : { title: 'A Study Guide', author: 'Someone Else', kind: 'book', printed: true })(); };
    const rows = [{ id: 1, title: 'smith_world_order_essays', author: 'pdf-s-smith' }, { id: 2, title: 'Study Guide', author: 'bayat' }];
    const texts = { 1: 'World Order Essays\nBy Jane Smith\n' + 'text '.repeat(40), 2: 'A STUDY GUIDE\n' + 'text '.repeat(40) };
    const r = await run(rows, texts, create);
    expect(calls).toBe(2);
    expect(r.proposals[0]).toMatchObject({ id: 1, author: 'Jane Smith', title: 'World Order Essays', review: [] });
    expect(r.proposals[1]).toMatchObject({ author: 'Someone Else', title: null });   // 'Study Guide' is a title already: kept
    expect(r.proposals[1].review).toContain("author lacks the locator surname 'bayat'");
    expect(r.ready).toBe(1);
  });
  it('capitals become title case; apostrophes do not block corroboration; file-name titles are recognised', async () => {
    expect(unshout('THE MODERN SOCIAL RELIGION')).toBe('The Modern Social Religion');
    expect(unshout('HORACE HOLLEY')).toBe('Horace Holley');
    expect(unshout('Ṭáhirih the Pure')).toBe('Ṭáhirih the Pure');
    expect(fileTitle('1920-03-06,%20Thomas%20W%20Fleming%20The_Buckeye_State') && fileTitle('memoriam_bw_12') && !fileTitle('Laws Abrogated by Baha\'u\'llah')).toBe(true);
    const r = await run([{ id: 5, title: 'Tablets of Tarazat', author: 'bahaullah' }], { 5: 'TABLETS ' + 'text '.repeat(40) },
      reply({ title: 'Tablet of Tarazat', author: "Baha'u'llah", kind: 'book', printed: true }));
    expect(r.proposals[0]).toMatchObject({ author: 'Bahá’u’lláh', title: null, review: [] });
    expect([figureName('BAHAULLAH'), figureName("'Abdu'l-Baha"), figureName('Jane Smith')]).toEqual(['Bahá’u’lláh', '‘Abdu’l-Bahá', 'Jane Smith']);
    expect([sharesFileWord('memoriam_bw_12', "The Baha'i World, Volume XI"), sharesFileWord('browne_literary_history_persia_3', 'A Literary History of Persia')]).toEqual([false, true]);
  });
  it('a newspaper page with no byline keeps author unknown (review), with its publication', async () => {
    const r = await run([{ id: 3, title: 'cleveland_1920-03-06', author: 'newspaper' }], { 3: 'THE CLEVELAND ADVOCATE ' + 'news '.repeat(40) },
      reply({ title: 'The Cleveland Advocate, 6 March 1920', author: null, kind: 'newspaper', publication: 'The Cleveland Advocate', printed: true }));
    expect(r.proposals[0]).toMatchObject({ title: 'The Cleveland Advocate, 6 March 1920', author: 'The Cleveland Advocate', review: [] });
  });
  it('newspaper issues: date and page from the file name, publication voted per series, clippings keep their column', async () => {
    expect(issueOf('oregon_newspaper_archive_1923-05-05_ed-1_seq-4')).toMatchObject({ date: '5 May 1923', page: '4', column: null });
    expect(issueOf('journal_constantinople_1848-01-16_p2')).toMatchObject({ date: '16 January 1848', page: '2' });
    expect(issueOf('1920-03-06,%20Thomas%20W%20Fleming%20The_Buckeye_State')).toMatchObject({ column: 'The Buckeye State', page: null });
    expect(issueOf('Tablets of Tarazat')).toBe(null);
    const rows = [{ id: 1, title: 'paper_archive_1923-05-05_seq-4', author: 'newspaper' }, { id: 2, title: 'paper_archive_1923-06-02_seq-1', author: 'newspaper' },
      { id: 3, title: 'paper_archive_1924-01-05_seq-1', author: 'newspaper' }, { id: 4, title: '1916-07-01,%20Jo%20Doe%20The_Corner_Column', author: 'newspaper' }];
    const pubs = { 1: 'The Advocate', 2: 'The Advocate', 3: 'Portland Advocate', 4: 'The Daily Planet (Weekend Edition)' };
    const create = async (role, b) => { const id = +b.messages[0].content.match(/ID(\d)/)[1];
      return reply({ title: `${pubs[id]}, May 6, 1933`, author: id === 4 ? 'Someone' : null, kind: 'newspaper', publication: pubs[id], printed: true })(); };
    const r = await run(rows, { 1: 'ID1 ' + 'news '.repeat(40), 2: 'ID2 ' + 'news '.repeat(40), 3: 'ID3 ' + 'news '.repeat(40), 4: 'ID4 ' + 'news '.repeat(40) }, create);
    expect(r.proposals.map((p) => p.title)).toEqual(['The Advocate, 5 May 1923, p. 4', 'The Advocate, 2 June 1923, p. 1', 'The Advocate, 5 January 1924, p. 1',
      'The Corner Column, The Daily Planet, 1 July 1916']);
    expect(r.proposals.map((p) => p.author)).toEqual(['The Advocate', 'The Advocate', 'The Advocate', null]);
    expect(r.proposals[3].review).toEqual(['clipping: writer not established (title only)']);
  });
});
